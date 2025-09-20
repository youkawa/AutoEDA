import types
import time
import pytest

from apps.api.services.sandbox import SandboxRunner, SandboxError


def test_template_inline_cancel_cooperative(monkeypatch):
    runner = SandboxRunner(timeout_sec=2.0)
    # cancel immediately
    with pytest.raises(SandboxError) as ei:
        runner.run_template(spec_hint="bar", dataset_id="ds_x", cancel_check=lambda: True)
    assert "cancelled" in str(ei.value)


def test_template_subprocess_cancel_cooperative(monkeypatch):
    runner = SandboxRunner(timeout_sec=1.0)
    # cancel after a short wait by toggling flag
    flag = {"v": False}

    def _check():
        return flag["v"]

    # flip flag in background
    def _flip():
        time.sleep(0.05)
        flag["v"] = True

    import threading

    t = threading.Thread(target=_flip)
    t.start()
    with pytest.raises(SandboxError) as ei:
        runner.run_template_subprocess(spec_hint="bar", dataset_id="ds_x", cancel_check=_check)
    t.join()
    assert "cancelled" in str(ei.value)

