from apps.api.services.security import redact


def test_redact_jwt_and_userinfo():
    s = (
        "Authorization: Bearer abc123\n"
        "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiam9obiJ9.KFh1Z2VTeW1Cb2R5U2lnbmF0dXJl\n"
        "url=https://user:secret@example.com/path?q=1\n"
    )
    out = redact(s, max_len=1000)
    # Bearer masked
    assert 'Bearer ***' in out
    # JWT masked
    assert 'eyJ' not in out
    # URL userinfo masked
    assert 'https://***:***@' in out

