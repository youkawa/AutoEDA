from apps.api.services.security import summarize_logs, redact


def test_summarize_keeps_first_lines_and_final_exception():
    tb = (
        "Traceback (most recent call last):\n"
        "  File \"/x/y/z.py\", line 1, in <module>\n"
        "    main()\n"
        "  File \"/x/y/z.py\", line 2, in main\n"
        "    1/0\n"
        "ZeroDivisionError: division by zero\n"
    )
    out = summarize_logs(tb, max_lines=3, max_chars=200)
    # first line must be kept and final exception present
    assert out.splitlines()[0].startswith("Traceback ")
    assert "ZeroDivisionError" in out


def test_summarize_applies_redact_and_truncates():
    s = "Authorization: Bearer abcdef\nsecret=shhh\nline3\nline4\nline5\nline6\nline7"
    out = summarize_logs(s, max_lines=4, max_chars=60)
    assert 'Bearer ***' in out
    assert len(out) <= 60

