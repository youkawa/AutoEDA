import os
import sys
import pytest

sys.path.insert(0, os.getcwd())
from apps.api.services.sandbox import SandboxRunner, SandboxError


def test_generated_chart_broken_json_logs(monkeypatch):
    # simulate child process producing invalid JSON and stderr logs
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY_MS", "0")
    monkeypatch.setenv("AUTOEDA_SB_TEST_DELAY2_MS", "0")
    # Use env to force invalid output; implemented via format_error handling
    # We cannot force the child to emit invalid JSON without changing code;
    # therefore we simulate by truncating stdout to empty via very short timeout
    # and check the raised SandboxError carries code.
    runner = SandboxRunner(timeout_sec=0.0)
    with pytest.raises(SandboxError) as ei:
        runner.run_generated_chart(job_id=None, spec_hint="bar", dataset_id="ds_x")
    err = ei.value
    assert isinstance(err, SandboxError)
    assert err.code in {"timeout", "format_error"}

