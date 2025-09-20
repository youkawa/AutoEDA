import json
import sys
from pathlib import Path
from typing import Any, Dict, Set, Tuple


def fail(msg: str) -> None:
    print(f"[openapi-compat] {msg}")
    sys.exit(1)


def load(path: str = "dist/openapi.json") -> Dict[str, Any]:
    p = Path(path)
    if not p.exists():
        fail("dist/openapi.json not found. Run schema:dump:openapi first.")
    return json.loads(p.read_text())


def main() -> None:
    data_cur = load("dist/openapi.json")
    data_base = json.loads(Path("docs/api/openapi.snapshot.json").read_text()) if Path("docs/api/openapi.snapshot.json").exists() else None

    comps_cur = data_cur.get("components", {}).get("schemas", {})
    if "ChartJob" not in comps_cur:
        fail("ChartJob schema missing in components")
    chart_cur = comps_cur["ChartJob"]
    props_cur: Dict[str, Any] = chart_cur.get("properties", {}) or {}
    req_cur = set(chart_cur.get("required", []) or [])

    # error_code enum check (current vs hardcoded expected)
    if "error_code" not in props_cur:
        fail("ChartJob.error_code missing")
    ec_schema = props_cur["error_code"]
    enum = ec_schema.get("enum") or []
    expected = {"timeout", "cancelled", "forbidden_import", "format_error", "unknown"}
    if not enum:
        agg = set()
        for key in ("anyOf", "oneOf"):
            for item in ec_schema.get(key, []) or []:
                for v in item.get("enum", []) or []:
                    if isinstance(v, str):
                        agg.add(v)
        if agg:
            enum = sorted(agg)
    if not enum:
        fail("ChartJob.error_code has no enum values (expected a finite set)")
    actual: Set[str] = set(enum)
    enum_missing = sorted(expected - actual)
    enum_extra = sorted(actual - expected)

    # Compare with snapshot (if available) for required/type changes
    required_missing: Set[str] = set()
    required_extra: Set[str] = set()
    type_changes: Dict[str, Tuple[str, str]] = {}
    if data_base:
        comps_base = data_base.get("components", {}).get("schemas", {})
        base = comps_base.get("ChartJob", {})
        props_base: Dict[str, Any] = base.get("properties", {}) or {}
        req_base = set(base.get("required", []) or [])
        required_missing = req_base - req_cur
        required_extra = req_cur - req_base
        # naive type compare
        for k in set(props_cur.keys()) & set(props_base.keys()):
            def get_type(x: Dict[str, Any]) -> str:
                if "type" in x and isinstance(x["type"], str):
                    return x["type"]
                for alt in ("oneOf", "anyOf", "allOf"):
                    if x.get(alt):
                        types = []
                        for it in x[alt]:
                            t = it.get("type")
                            if isinstance(t, str): types.append(t)
                        if types:
                            return "/".join(sorted(set(types)))
                return "unknown"
            t_cur = get_type(props_cur[k])
            t_base = get_type(props_base[k])
            if t_cur != t_base:
                type_changes[k] = (t_base, t_cur)

    report = {
        "enum_expected": sorted(expected),
        "enum_actual": sorted(actual),
        "missing": enum_missing,    # kept for backward compatibility with workflow step
        "extra": enum_extra,        # kept for backward compatibility
        "required_expected": sorted(list(req_cur | (data_base and set(base.get("required", []) or []) or set()))),
        "required_actual": sorted(list(req_cur)),
        "required_missing": sorted(list(required_missing)),
        "required_extra": sorted(list(required_extra)),
        "type_changes": [{"prop": k, "from": v[0], "to": v[1]} for k, v in sorted(type_changes.items())],
    }
    outdir = Path("reports"); outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "openapi_compat_diff.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))

    # Exit non-zero only when clearly breaking (enum missing OR required added/removed OR type changes)
    breaking = bool(enum_missing or required_missing or required_extra or type_changes)
    if breaking:
        fail("OpenAPI compatibility: breaking changes detected (see reports/openapi_compat_diff.json)")
    print("[openapi-compat] OpenAPI compatibility checks passed (no breaking changes).")


if __name__ == "__main__":
    main()
