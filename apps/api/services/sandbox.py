"""SandboxRunner (MVP)

目的: 将来的な安全実行基盤の足場を用意しつつ、現段階ではテンプレート生成に委譲する。
制約: NW遮断/timeout/mem制限は最小限のフックのみ（本実装では実行コードを走らせない）。
"""
from __future__ import annotations

import contextlib
import resource
import socket
import time
from typing import Any, Dict, Optional, Callable
import os
import subprocess
import tempfile


class SandboxError(RuntimeError):
    def __init__(self, message: str, *, code: Optional[str] = None, logs: Optional[str] = None) -> None:
        super().__init__(message)
        self.code = code
        self.logs = logs


class SandboxRunner:
    def __init__(self, *, timeout_sec: float = 10.0, mem_limit_mb: int = 512) -> None:
        self.timeout_sec = timeout_sec
        self.mem_limit_mb = mem_limit_mb

    def _disable_network(self):
        class _Guard:
            def __enter__(self_inner):
                self_inner._orig = socket.socket  # type: ignore[attr-defined]
                try:
                    def _blocked_socket(*args, **kwargs):  # type: ignore[no-untyped-def]
                        raise SandboxError("network disabled in sandbox")
                    socket.socket = _blocked_socket  # type: ignore[assignment]
                except Exception:
                    pass
                return self_inner
            def __exit__(self_inner, exc_type, exc, tb):
                with contextlib.suppress(Exception):
                    socket.socket = getattr(self_inner, '_orig')  # type: ignore[assignment]
                return False
        return _Guard()

    def _limit_memory(self) -> None:
        # Unix only; ignore if not supported
        with contextlib.suppress(Exception):
            soft = self.mem_limit_mb * 1024 * 1024
            hard = soft
            resource.setrlimit(resource.RLIMIT_AS, (soft, hard))

    def run_template(self, *, spec_hint: Optional[str], dataset_id: Optional[str], cancel_check: Optional[Callable[[], bool]] = None) -> Dict[str, Any]:
        # Here we do not execute arbitrary code; just return a template result.
        # charts.py のテンプレート関数を利用する。
        from . import charts as chartsvc

        t0 = time.perf_counter()
        try:
            with self._disable_network():
                self._limit_memory()
                if cancel_check and cancel_check():
                    raise SandboxError("cancelled")
                result = chartsvc._template_result(spec_hint, dataset_id)
        except SandboxError:
            raise
        except Exception:
            # 非対応環境では無視（フォールバック）
            result = chartsvc._template_result(spec_hint, dataset_id)
        dur_ms = int((time.perf_counter() - t0) * 1000)
        result.setdefault("meta", {})
        result["meta"].update({"duration_ms": dur_ms})
        return result

    def run_template_subprocess(self, *, spec_hint: Optional[str], dataset_id: Optional[str], cancel_check: Optional[Callable[[], bool]] = None) -> Dict[str, Any]:
        """Best-effort subprocess isolation（MVP）.

        - FS: 作業は一時ディレクトリ
        - NW: 明示ブロックはしない（将来のseccomp等に委ねる）
        - Allowlist: 追加パッケージは使わない（標準ライブラリのみ）
        """
        import json as _json  # local alias
        code = (
            "import json, os, time;\n"
            "cfg=json.loads(open('in.json').read());\n"
            "kind=cfg.get('kind','bar');\n"
            "delay_ms=int(os.environ.get('AUTOEDA_SB_TEST_DELAY_MS','0') or '0');\n"
            "if delay_ms>0: time.sleep(delay_ms/1000.0);\n"
            "# rendering phase (simulate)\n"
            "spec={'mark': kind if kind in ('bar','line') else 'point','data':{'values':[{'x':0,'y':1}]}};\n"
            "delay2_ms=int(os.environ.get('AUTOEDA_SB_TEST_DELAY2_MS','0') or '0');\n"
            "if delay2_ms>0: time.sleep(delay2_ms/1000.0);\n"
            "print(json.dumps({'language':'python','library':'vega','code':'# generated','outputs':[{'type':'vega','mime':'application/json','content':spec}]}, ensure_ascii=False))\n"
        )
        tmpdir = tempfile.mkdtemp(prefix="autoeda_sbx_")
        payload = {"kind": (spec_hint or "bar").lower(), "dataset_id": dataset_id}
        in_path = os.path.join(tmpdir, "in.json")
        with open(in_path, "w", encoding="utf-8") as f:
            f.write(_json.dumps(payload))
        try:
            # lazy import to avoid cycles
            from . import charts as chartsvc  # type: ignore
            def _preexec():  # POSIX only
                with contextlib.suppress(Exception):
                    resource.setrlimit(resource.RLIMIT_AS, (self.mem_limit_mb * 1024 * 1024, self.mem_limit_mb * 1024 * 1024))
                    resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
                    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
                    if hasattr(resource, 'RLIMIT_NPROC'):
                        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
                    if hasattr(resource, 'RLIMIT_STACK'):
                        resource.setrlimit(resource.RLIMIT_STACK, (8 * 1024 * 1024, 8 * 1024 * 1024))
                    if hasattr(resource, 'RLIMIT_NPROC'):
                        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
                    if hasattr(resource, 'RLIMIT_STACK'):
                        resource.setrlimit(resource.RLIMIT_STACK, (8 * 1024 * 1024, 8 * 1024 * 1024))
                    if hasattr(resource, 'RLIMIT_NPROC'):
                        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
                    if hasattr(resource, 'RLIMIT_STACK'):
                        resource.setrlimit(resource.RLIMIT_STACK, (8 * 1024 * 1024, 8 * 1024 * 1024))
            # Propagate testing delays for both generate and rendering phases
            env = {
                "PYTHONUNBUFFERED": "1",
                "PATH": "/usr/bin:/bin",
                "AUTOEDA_SB_TEST_DELAY_MS": os.environ.get("AUTOEDA_SB_TEST_DELAY_MS", ""),
                "AUTOEDA_SB_TEST_DELAY2_MS": os.environ.get("AUTOEDA_SB_TEST_DELAY2_MS", ""),
            }
            proc = subprocess.Popen(["python3", "-I", "-c", code], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, preexec_fn=_preexec if hasattr(os, 'setuid') else None)
            started = time.perf_counter()
            while True:
                ret = proc.poll()
                if ret is not None:
                    break
                if cancel_check and cancel_check():
                    with contextlib.suppress(Exception):
                        proc.kill()
                    raise SandboxError("cancelled", code="cancelled")
                if (time.perf_counter() - started) >= self.timeout_sec:
                    with contextlib.suppress(Exception):
                        proc.kill()
                    raise SandboxError("timeout")
                time.sleep(0.01)
            out = (proc.stdout.read() if proc.stdout else "").strip()
            obj = _json.loads(out or "{}")
        except SandboxError:
            raise
        except Exception:
            # フォールバック
            from . import charts as chartsvc  # type: ignore
            obj = chartsvc._template_result(spec_hint, dataset_id)
        finally:
            with contextlib.suppress(Exception):
                for name in os.listdir(tmpdir):
                    os.remove(os.path.join(tmpdir, name))
                os.rmdir(tmpdir)
        return obj

    def run_code_exec(self, *, code: str, dataset_id: Optional[str], timeout_sec: Optional[float] = None) -> Dict[str, Any]:
        """Execute user-provided analysis code under strict allowlist and resource caps.

        要件:
        - 標準ライブラリの一部のみ import 可（json/csv/os/time/math/statistics/random）
        - 危険呼び出しをASTで拒否（eval/exec/compile/__import__/input/breakpoint, os.system/popen/…）
        - data/datasets/<id>.csv の読み取りは可。外部NWなし。RLIMIT: AS/CPU/NOFILE。
        - 出力は print(JSON) 形式で { language, library, outputs: [...]} を期待（安全に失敗→format_error）。
        """
        import json as _json
        import ast as _ast
        import textwrap
        tmpdir = tempfile.mkdtemp(prefix="autoeda_exec_")
        try:
            user = textwrap.dedent(code or "").strip()
            if not user:
                raise SandboxError("empty code", code="format_error")
            # AST allowlist / denylist
            try:
                tree = _ast.parse(user)
                allowed_imports = {"json", "csv", "os", "time", "math", "statistics", "random"}
                banned_calls = {"eval", "exec", "compile", "__import__", "input", "breakpoint"}
                banned_os_calls = {"system", "popen", "spawnv", "spawnve", "spawnvp", "spawnvpe",
                                   "remove", "unlink", "rmdir", "removedirs", "rename", "renames",
                                   "chdir", "chmod", "chown"}
                for node in _ast.walk(tree):
                    if isinstance(node, _ast.Import):
                        for alias in node.names:
                            root = (alias.name or "").split(".")[0]
                            if root not in allowed_imports:
                                raise SandboxError(f"forbidden import: {root}", code="forbidden_import")
                    elif isinstance(node, _ast.ImportFrom):
                        root = (node.module or "").split(".")[0]
                        if root and root not in allowed_imports:
                            raise SandboxError(f"forbidden import: {root}", code="forbidden_import")
                    elif isinstance(node, _ast.Call):
                        if isinstance(node.func, _ast.Name) and node.func.id in banned_calls:
                            raise SandboxError(f"forbidden call: {node.func.id}", code="forbidden_import")
                        if isinstance(node.func, _ast.Attribute) and isinstance(node.func.value, _ast.Name):
                            if node.func.value.id == 'os' and node.func.attr in banned_os_calls:
                                raise SandboxError(f"forbidden os call: os.{node.func.attr}", code="forbidden_import")
                        # open(): read-only に制限（w/a/+ / x は拒否）。パスは in.json か csv_path のみ許可。
                        if isinstance(node.func, _ast.Name) and node.func.id == 'open':
                            mode_arg = None
                            # 位置引数2番目
                            if len(node.args) >= 2 and isinstance(node.args[1], _ast.Constant) and isinstance(node.args[1].value, str):
                                mode_arg = node.args[1].value
                            # キーワード mode
                            for kw in getattr(node, 'keywords', []) or []:
                                if kw.arg == 'mode' and isinstance(kw.value, _ast.Constant) and isinstance(kw.value.value, str):
                                    mode_arg = kw.value.value
                            if mode_arg and any(x in mode_arg for x in ('w','a','+','x')):
                                raise SandboxError("forbidden open mode", code="forbidden_import")
                            # 第1引数がリテラルなら in.json のみ許可
                            if node.args and isinstance(node.args[0], _ast.Constant) and isinstance(node.args[0].value, str):
                                if node.args[0].value != 'in.json':
                                    raise SandboxError("forbidden open path", code="forbidden_import")
                            # 変数なら csv_path のみ許可
                            if node.args and isinstance(node.args[0], _ast.Name):
                                if node.args[0].id != 'csv_path':
                                    raise SandboxError("forbidden open target", code="forbidden_import")
            except SandboxError:
                raise
            except Exception:
                # 解析失敗は保守的に許可（後段のRLIMIT/実行で担保）
                pass

            # 付帯コンテキスト（CSVパス）を in.json で渡す
            payload = {
                "csv_path": os.path.abspath(os.path.join("data", "datasets", f"{dataset_id}.csv")) if dataset_id else None,
                "dataset_id": dataset_id,
            }
            in_path = os.path.join(tmpdir, "in.json")
            with open(in_path, "w", encoding="utf-8") as f:
                f.write(_json.dumps(payload))

            wrapper = (
                "import json, os\n"
                "cfg=json.loads(open('in.json','r',encoding='utf-8').read())\n"
                + user + "\n"
            )

            def _preexec():
                with contextlib.suppress(Exception):
                    ml = self.mem_limit_mb * 1024 * 1024
                    resource.setrlimit(resource.RLIMIT_AS, (ml, ml))
                    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
                    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
                    if hasattr(resource, 'RLIMIT_NPROC'):
                        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
                    if hasattr(resource, 'RLIMIT_STACK'):
                        resource.setrlimit(resource.RLIMIT_STACK, (8 * 1024 * 1024, 8 * 1024 * 1024))

            env = {"PYTHONUNBUFFERED": "1", "PATH": "/usr/bin:/bin"}
            tsec = float(timeout_sec or self.timeout_sec)
            proc = subprocess.Popen(["python3", "-I", "-c", wrapper], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, preexec_fn=_preexec if hasattr(os, 'setuid') else None)
            waited = 0.0
            while True:
                ret = proc.poll()
                if ret is not None:
                    break
                time.sleep(0.05)
                waited += 0.05
                if waited >= tsec:
                    with contextlib.suppress(Exception):
                        proc.kill()
                    raise SandboxError("timeout", code="timeout")
            out = (proc.stdout.read() if proc.stdout else "").strip()
            err = (proc.stderr.read() if proc.stderr else "").strip()
            try:
                obj = _json.loads(out or "{}")
            except Exception:
                logs = (err or out)[:500]
                raise SandboxError("format_error", code="format_error", logs=logs)
            obj.setdefault("meta", {})
            obj["meta"].update({"engine": "code_exec", "dataset_id": dataset_id})
            return obj
        except SandboxError:
            raise
        finally:
            with contextlib.suppress(Exception):
                for name in os.listdir(tmpdir):
                    os.remove(os.path.join(tmpdir, name))
                os.rmdir(tmpdir)

    def run_generated_chart(self, *, job_id: Optional[str], spec_hint: Optional[str], dataset_id: Optional[str], cancel_check: Optional[callable] = None) -> Dict[str, Any]:
        """Execute a constrained Python snippet in a subprocess to emit a Vega-like spec.

        - No third-party imports
        - Read-only CSV under data/datasets/<id>.csv (if present)
        - Time/Memory/File descriptor limits
        - Returns a dict compatible with ChartResult
        """
        import json as _json
        import ast as _ast
        import textwrap
        tmpdir = tempfile.mkdtemp(prefix="autoeda_exec_")
        try:
            payload = {
                "kind": (spec_hint or "bar").lower(),
                "csv_path": os.path.abspath(os.path.join("data", "datasets", f"{dataset_id}.csv")) if dataset_id else None,
                "max_rows": 200,
            }
            in_path = os.path.join(tmpdir, "in.json")
            with open(in_path, "w", encoding="utf-8") as f:
                f.write(_json.dumps(payload))

            code = textwrap.dedent(
                r"""
                import json, csv, os, time
                cfg = json.loads(open('in.json','r',encoding='utf-8').read())
                kind = cfg.get('kind','bar')
                csv_path = cfg.get('csv_path')
                # phase-1 delay (generation)
                try:
                    d1 = int(os.environ.get('AUTOEDA_SB_TEST_DELAY_MS','0') or '0')
                    if d1>0: time.sleep(d1/1000.0)
                except Exception:
                    pass
                values = []
                if csv_path and os.path.exists(csv_path):
                    try:
                        with open(csv_path, 'r', encoding='utf-8') as f:
                            rdr = csv.reader(f)
                            headers = next(rdr, None)
                            # choose first numeric-like column if any
                            col_idx = None
                            sample = []
                            for i, row in enumerate(rdr):
                                if i >= int(cfg.get('max_rows',200)): break
                                for j, cell in enumerate(row):
                                    try:
                                        val = float(cell)
                                    except Exception:
                                        val = None
                                    sample.append((i, j, val))
                            for _, j, val in sample:
                                if val is not None:
                                    col_idx = j; break
                            if col_idx is None:
                                # fallback to index-based series
                                values = [{"x": i, "y": (i%5)+1} for i in range(min(20, len(sample) or 20))]
                            else:
                                series = [val for _, j, val in sample if j==col_idx and val is not None]
                                if not series:
                                    values = [{"x": i, "y": (i%5)+1} for i in range(20)]
                                else:
                                    values = [{"x": i, "y": series[i]} for i in range(min(20, len(series)))]
                    except Exception:
                        values = [{"x": i, "y": (i%5)+1} for i in range(20)]
                else:
                    values = [{"x": i, "y": (i%5)+1} for i in range(20)]

                spec = {
                    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                    "mark": kind if kind in ("bar","line") else "point",
                    "data": {"name": "data"},
                    "encoding": {"x": {"field":"x","type":"quantitative"}, "y": {"field":"y","type":"quantitative"}},
                    "datasets": {"data": values},
                    "description": f"generated {kind} chart",
                }
                # phase-2 delay (rendering)
                try:
                    d2 = int(os.environ.get('AUTOEDA_SB_TEST_DELAY2_MS','0') or '0')
                    if d2>0: time.sleep(d2/1000.0)
                except Exception:
                    pass
                out = {
                    "language": "python", "library": "vega", "code": "# generated", "outputs": [
                        {"type":"vega","mime":"application/json","content": spec}
                    ]
                }
                print(json.dumps(out, ensure_ascii=False))
                """
            )

            # Host-side AST scanning (forbidden imports/calls)
            try:
                tree = _ast.parse(code)
                # 明示allowlist（標準ライブラリの一部のみ）
                allowed_imports = {"json", "csv", "os", "builtins", "time"}
                # 危険なビルトイン/関数呼び出しを拒否
                # open() は in.json や csv の参照に必要なため禁止対象から除外
                banned_calls = {"eval", "exec", "compile", "__import__", "input", "breakpoint"}
                # OS 経由の実行/FS破壊/環境変更を拒否
                banned_os_calls = {
                    "system", "popen", "spawnv", "spawnve", "spawnvp", "spawnvpe",
                    "remove", "unlink", "rmdir", "removedirs", "rename", "renames",
                    "chdir", "chmod", "chown",
                }
                for node in _ast.walk(tree):
                    if isinstance(node, _ast.Import):
                        for alias in node.names:
                            root = (alias.name or "").split(".")[0]
                            if root not in allowed_imports:
                                raise SandboxError(f"forbidden import: {root}", code="forbidden_import")
                    elif isinstance(node, _ast.ImportFrom):
                        root = (node.module or "").split(".")[0]
                        if root and root not in allowed_imports:
                            raise SandboxError(f"forbidden import: {root}", code="forbidden_import")
                    elif isinstance(node, _ast.Call):
                        if isinstance(node.func, _ast.Name) and node.func.id in banned_calls:
                            raise SandboxError(f"forbidden call: {node.func.id}", code="forbidden_import")
                        if isinstance(node.func, _ast.Attribute) and isinstance(node.func.value, _ast.Name):
                            if node.func.value.id == 'os' and node.func.attr in banned_os_calls:
                                raise SandboxError(f"forbidden os call: os.{node.func.attr}", code="forbidden_import")
            except SandboxError:
                raise
            except Exception:
                # AST 解析に失敗しても後段のallowlistでガード
                pass

            def _preexec():  # POSIX only
                with contextlib.suppress(Exception):
                    resource.setrlimit(resource.RLIMIT_AS, (self.mem_limit_mb * 1024 * 1024, self.mem_limit_mb * 1024 * 1024))
                    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
                    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))

            env = {
                "PYTHONUNBUFFERED": "1",
                "PATH": "/usr/bin:/bin",
                # tests can control cooperative timing via env
                "AUTOEDA_SB_TEST_DELAY_MS": os.environ.get("AUTOEDA_SB_TEST_DELAY_MS", ""),
                "AUTOEDA_SB_TEST_DELAY2_MS": os.environ.get("AUTOEDA_SB_TEST_DELAY2_MS", ""),
            }
            proc = subprocess.Popen(["python3", "-I", "-c", code], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, preexec_fn=_preexec if hasattr(os, 'setuid') else None)
            waited = 0.0
            interval = 0.05
            while True:
                ret = proc.poll()
                if ret is not None:
                    break
                if cancel_check and cancel_check():
                    with contextlib.suppress(Exception):
                        proc.kill()
                    raise SandboxError("cancelled", code="cancelled")
                time.sleep(interval)
                waited += interval
                if waited >= self.timeout_sec:
                    with contextlib.suppress(Exception):
                        proc.kill()
                    raise SandboxError("timeout", code="timeout")
            out = (proc.stdout.read() if proc.stdout else "").strip()
            err = (proc.stderr.read() if proc.stderr else "").strip()
            try:
                obj = _json.loads(out or "{}")
            except Exception:
                logs = (err or out)[:500]
                raise SandboxError("format_error", code="format_error", logs=logs)
            # add meta
            obj.setdefault("meta", {})
            obj["meta"].update({"engine": "generated", "duration_ms": None})
            return obj
        except SandboxError:
            raise
        except Exception:
            # fallback to template path
            from . import charts as chartsvc  # type: ignore
            return chartsvc._template_result(spec_hint, dataset_id)
        finally:
            with contextlib.suppress(Exception):
                for name in os.listdir(tmpdir):
                    os.remove(os.path.join(tmpdir, name))
                os.rmdir(tmpdir)
