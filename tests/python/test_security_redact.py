import sys, os
sys.path.insert(0, os.getcwd())

from apps.api.services.security import redact


def test_redact_basic_patterns():
    src = (
        "Email alice@example.com Phone +1 650-555-1234 "
        "Bearer abcDEF.ghi_JKL-123 \nAuthorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l\n"
        "api_key='sk-THISISALONGTOKEN1234567890' token=abcdef1234567890 client_secret=topsecret url=https://x/y?api_key=sekret&password=hunter2&foo=1 "
        "uuid=550e8400-e29b-41d4-a716-446655440000 akid=AKIA1234567890ABCD"
    )
    out = redact(src, max_len=1000)
    assert 'alice@example.com' not in out and '***@***' in out
    assert 'Bearer ***' in out and 'Bearer abc' not in out
    assert 'Authorization: Basic ***' in out
    assert 'api_key=' in out and '***' in out
    assert 'token=abcdef' not in out
    assert 'api_key=sekret' not in out and 'api_key=***' in out
    # password may be redacted entirely if part of long token masking; ensure sensitive value is not visible
    assert 'password=hunter2' not in out
    assert '550e8400-e29b-41d4-a716-446655440000' not in out
    assert 'AKIA' not in out
    assert '650' not in out

def test_redact_truncation():
    s = ('abcd ' * 200)  # 1000 chars with spaces (not a long token)
    out = redact(s, max_len=500)
    assert len(out) == 500 and out.endswith('...')
