import os
import sys
import time
import threading
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
def test_exec_matrix(monkeypatch, delay, delay2, timeout, expect):
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY_MS", str(delay))
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY2_MS", str(delay2))
    runner = SandboxRunner(timeout_sec=timeout)
    if expect == "success":
        obj = runner.run_generated_chart(job_id=None, spec_hint="line", dataset_id="ds_x")
        assert obj.get("outputs") is not None
    elif expect == "cancel":
        flag = {"v": False}
        def _check(): return flag["v"]
        t = threading.Thread(target=lambda: (time.sleep(0.05), flag.__setitem__('v', True)))
        t.start()
        with pytest.raises(SandboxError):
            runner.run_generated_chart(job_id=None, spec_hint="bar", dataset_id="ds_x", cancel_check=_check)
        t.join()
    else:
        with pytest.raises(SandboxError):
            runner.run_generated_chart(job_id=None, spec_hint="bar", dataset_id="ds_x")


@pytest.mark.parametrize("flip_ms,expect", [(10, "cancel"), (200, "success")])
def test_exec_cancel_timing(monkeypatch, flip_ms, expect):
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY_MS", "100")
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY2_MS", "0")
    runner = SandboxRunner(timeout_sec=2.0)
    if expect == "success":
        obj = runner.run_generated_chart(job_id=None, spec_hint="bar", dataset_id="ds_x")
        assert obj.get("outputs") is not None
        return
    cancel = {"v": False}
    def _check(): return cancel["v"]
    def _flip():
        time.sleep(flip_ms/1000.0)
        cancel["v"] = True
    t = threading.Thread(target=_flip)
    t.start()
    with pytest.raises(SandboxError):
        runner.run_generated_chart(job_id=None, spec_hint="bar", dataset_id="ds_x", cancel_check=_check)
    t.join()

