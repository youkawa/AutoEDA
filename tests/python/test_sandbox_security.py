from apps.api.services.sandbox import SandboxRunner, SandboxError


def test_open_write_mode_forbidden(tmp_path):
    sb = SandboxRunner()
    code = "open('tmp.txt','w')\nprint({'language':'python','library':'vega','outputs':[]})"
    try:
        sb.run_code_exec(code=code, dataset_id=None, timeout_sec=1)
        assert False, "expected SandboxError"
    except SandboxError as exc:
        assert getattr(exc, 'code', None) == 'forbidden_import'


def test_open_injson_allowed(tmp_path):
    sb = SandboxRunner()
    # read in.json (always exists in runner)
    code = (
        "import json\n"
        "txt=open('in.json','r',encoding='utf-8').read()[:2]\n"
        "print(json.dumps({'language':'python','library':'vega','outputs':[{'type':'text','mime':'text/plain','content':txt}]}))\n"
    )
    out = sb.run_code_exec(code=code, dataset_id=None, timeout_sec=1)
    assert out.get('outputs'), out

