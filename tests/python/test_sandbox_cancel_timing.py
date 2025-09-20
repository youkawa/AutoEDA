import os
import sys
import time
import threading
import pytest

sys.path.insert(0, os.getcwd())
from apps.api.services.sandbox import SandboxRunner, SandboxError


@pytest.mark.parametrize(
    "delay_ms, flip_ms, expect",
    [
        (100, 10, "cancel"),
        (100, 200, "success"),
        (50, 25, "cancel"),
    ],
)
def test_cancel_timing(monkeypatch, delay_ms: int, flip_ms: int, expect: str):
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY_MS", str(delay_ms))
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY2_MS", "0")
    runner = SandboxRunner(timeout_sec=2.0)

    if expect == "success":
        obj = runner.run_template_subprocess(spec_hint="bar", dataset_id="ds_x")
        assert obj.get("outputs") is not None
        return

    cancel = {"v": False}

    def _check() -> bool:
        return cancel["v"]

    def _flip():
        time.sleep(flip_ms / 1000.0)
        cancel["v"] = True

    t = threading.Thread(target=_flip)
    t.start()
    with pytest.raises(SandboxError):
        runner.run_template_subprocess(spec_hint="bar", dataset_id="ds_x", cancel_check=_check)
    t.join()

