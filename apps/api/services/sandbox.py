"""SandboxRunner (MVP)

目的: 将来的な安全実行基盤の足場を用意しつつ、現段階ではテンプレート生成に委譲する。
制約: NW遮断/timeout/mem制限は最小限のフックのみ（本実装では実行コードを走らせない）。
"""
from __future__ import annotations

import contextlib
import resource
import socket
import time
from typing import Any, Dict, Optional
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

    def run_template(self, *, spec_hint: Optional[str], dataset_id: Optional[str]) -> Dict[str, Any]:
        # Here we do not execute arbitrary code; just return a template result.
        # charts.py のテンプレート関数を利用する。
        from . import charts as chartsvc

        t0 = time.perf_counter()
        try:
            with self._disable_network():
                self._limit_memory()
                result = chartsvc._template_result(spec_hint, dataset_id)
        except Exception:
            # 非対応環境では無視（フォールバック）
            result = chartsvc._template_result(spec_hint, dataset_id)
        dur_ms = int((time.perf_counter() - t0) * 1000)
        result.setdefault("meta", {})
        result["meta"].update({"duration_ms": dur_ms})
        return result

    def run_template_subprocess(self, *, spec_hint: Optional[str], dataset_id: Optional[str]) -> Dict[str, Any]:
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
