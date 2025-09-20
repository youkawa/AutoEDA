import sys, os
sys.path.insert(0, os.getcwd())

from apps.api.services.security import redact


def test_redact_basic_patterns():
    src = (
        "Email alice@example.com Phone +1 650-555-1234 "
        "Bearer abcDEF.ghi_JKL-123 \n"
        "api_key='sk-THISISALONGTOKEN1234567890' token=abcdef1234567890 url=https://x/y?api_key=sekret&foo=1"
    )
    out = redact(src, max_len=1000)
    assert 'alice@example.com' not in out and '***@***' in out
    assert 'Bearer ***' in out and 'Bearer abc' not in out
    assert 'api_key=' in out and '***' in out
    assert 'token=abcdef' not in out
    assert 'api_key=sekret' not in out and 'api_key=***' in out
    assert '650' not in out

def test_redact_truncation():
    s = ('abcd ' * 200)  # 1000 chars with spaces (not a long token)
    out = redact(s, max_len=500)
    assert len(out) == 500 and out.endswith('...')
