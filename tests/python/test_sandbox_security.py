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


def test_open_other_path_forbidden():
    sb = SandboxRunner()
    code = (
        "import json\n"
        "_=open('other.txt','r',encoding='utf-8')\n"
        "print(json.dumps({'language':'python','library':'vega','outputs':[]}))\n"
    )
    try:
        sb.run_code_exec(code=code, dataset_id=None, timeout_sec=1)
        assert False, "expected forbidden_import for path"
    except SandboxError as exc:
        assert getattr(exc, 'code', None) == 'forbidden_import'


def test_open_variable_not_csv_path_forbidden():
    sb = SandboxRunner()
    code = (
        "import json\n"
        "name='dummy.csv'\n"
        "_=open(name,'r',encoding='utf-8')\n"
        "print(json.dumps({'language':'python','library':'vega','outputs':[]}))\n"
    )
    try:
        sb.run_code_exec(code=code, dataset_id=None, timeout_sec=1)
        assert False, "expected forbidden_import for variable target"
    except SandboxError as exc:
        assert getattr(exc, 'code', None) == 'forbidden_import'


def test_timeout_is_enforced():
    sb = SandboxRunner(timeout_sec=0.1)
    code = "import time\ntime.sleep(0.2)\nprint({'language':'python','library':'vega','outputs':[]})"
    try:
        sb.run_code_exec(code=code, dataset_id=None, timeout_sec=0.1)
        assert False, "expected timeout"
    except SandboxError as exc:
        assert getattr(exc, 'code', None) == 'timeout'
