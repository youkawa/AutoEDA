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
            # 非対応環境では無視
            result = chartsvc._template_result(spec_hint, dataset_id)
        dur_ms = int((time.perf_counter() - t0) * 1000)
        result.setdefault("meta", {})
        result["meta"].update({"duration_ms": dur_ms})
        return result
