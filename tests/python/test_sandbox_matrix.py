import os
import sys
import time
import pytest

sys.path.insert(0, os.getcwd())
from apps.api.services.sandbox import SandboxRunner, SandboxError


@pytest.mark.parametrize(
    "delay,delay2,timeout,expect",
    [
        (0, 0, 0.5, "success"),
        (200, 0, 0.1, "timeout"),
        (0, 200, 0.1, "timeout"),
        (100, 0, 2.0, "cancel"),
    ],
)
def test_subprocess_matrix(monkeypatch, delay, delay2, timeout, expect):
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY_MS", str(delay))
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY2_MS", str(delay2))
    runner = SandboxRunner(timeout_sec=timeout)
    if expect == "success":
        obj = runner.run_template_subprocess(spec_hint="bar", dataset_id="ds_x")
        assert obj.get("outputs") is not None
    elif expect == "cancel":
        flag = {"v": False}
        def _check(): return flag["v"]
        import threading, time
        t = threading.Thread(target=lambda: (time.sleep(0.05), flag.__setitem__('v', True)))
        t.start()
        with pytest.raises(SandboxError):
            runner.run_template_subprocess(spec_hint="bar", dataset_id="ds_x", cancel_check=_check)
        t.join()
    else:
        with pytest.raises(SandboxError):
            runner.run_template_subprocess(spec_hint="bar", dataset_id="ds_x")
