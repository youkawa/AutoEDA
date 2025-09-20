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
    pass


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
            "import json;\n"
            "kind=json.loads(open('in.json').read()).get('kind','bar');\n"
            "spec={'mark': kind if kind in ('bar','line') else 'point','data':{'values':[{'x':0,'y':1}]}};\n"
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
            env = {"PYTHONUNBUFFERED": "1", "PATH": "/usr/bin:/bin"}
            proc = subprocess.run(["python3", "-I", "-c", code], cwd=tmpdir, capture_output=True, text=True, timeout=self.timeout_sec, check=True, env=env, preexec_fn=_preexec if hasattr(os, 'setuid') else None)
            out = proc.stdout.strip()
            obj = _json.loads(out)
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
                import builtins
                _allowed = {'json','csv','os'}
                _orig_import = builtins.__import__
                def _guard_import(name, *args, **kwargs):
                    root = (name or '').split('.')[0]
                    if root not in _allowed:
                        raise ImportError(f'disallowed module: {root}')
                    return _orig_import(name, *args, **kwargs)
                builtins.__import__ = _guard_import

                import json, csv, os
                cfg = json.loads(open('in.json','r',encoding='utf-8').read())
                kind = cfg.get('kind','bar')
                csv_path = cfg.get('csv_path')
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
                allowed_imports = {"json", "csv", "os"}
                # 危険なビルトイン/関数呼び出しを拒否
                banned_calls = {"eval", "exec", "compile", "__import__", "open", "input", "breakpoint"}
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
                                raise SandboxError(f"forbidden import: {root}")
                    elif isinstance(node, _ast.ImportFrom):
                        root = (node.module or "").split(".")[0]
                        if root and root not in allowed_imports:
                            raise SandboxError(f"forbidden import: {root}")
                    elif isinstance(node, _ast.Call):
                        if isinstance(node.func, _ast.Name) and node.func.id in banned_calls:
                            raise SandboxError(f"forbidden call: {node.func.id}")
                        if isinstance(node.func, _ast.Attribute) and isinstance(node.func.value, _ast.Name):
                            if node.func.value.id == 'os' and node.func.attr in banned_os_calls:
                                raise SandboxError(f"forbidden os call: os.{node.func.attr}")
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

            env = {"PYTHONUNBUFFERED": "1", "PATH": "/usr/bin:/bin"}
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
                    raise SandboxError("cancelled")
                time.sleep(interval)
                waited += interval
                if waited >= self.timeout_sec:
                    with contextlib.suppress(Exception):
                        proc.kill()
                    raise SandboxError("timeout")
            out = (proc.stdout.read() if proc.stdout else "").strip()
            obj = _json.loads(out or "{}")
            # add meta
            obj.setdefault("meta", {})
            obj["meta"].update({"engine": "generated", "duration_ms": None})
            return obj
        except Exception:
            # fallback to template path
            from . import charts as chartsvc  # type: ignore
            return chartsvc._template_result(spec_hint, dataset_id)
        finally:
            with contextlib.suppress(Exception):
                for name in os.listdir(tmpdir):
                    os.remove(os.path.join(tmpdir, name))
                os.rmdir(tmpdir)
