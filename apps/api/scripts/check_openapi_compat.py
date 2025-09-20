import json
import sys
from pathlib import Path
from typing import Any, Dict


def fail(msg: str) -> None:
    print(f"[openapi-compat] {msg}")
    sys.exit(1)


def load(path: str = "dist/openapi.json") -> Dict[str, Any]:
    p = Path(path)
    if not p.exists():
        fail("dist/openapi.json not found. Run schema:dump:openapi first.")
    return json.loads(p.read_text())


def main() -> None:
    data = load()
    comps = data.get("components", {}).get("schemas", {})
    if "ChartJob" not in comps:
        fail("ChartJob schema missing in components")
    chart_job = comps["ChartJob"]
    props = chart_job.get("properties", {}) or {}
    if "error_code" not in props:
        fail("ChartJob.error_code missing")
    ec_schema = props["error_code"]
    enum = ec_schema.get("enum") or []
    expected = {"timeout", "cancelled", "forbidden_import", "format_error", "unknown"}
    # If enum is represented via oneOf/anyOf, try to collect string enums
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
    missing = expected - set(enum)
    if missing:
        fail(f"ChartJob.error_code enum missing values: {sorted(missing)}")
    print("[openapi-compat] ChartJob.error_code enum compatible.")


if __name__ == "__main__":
    main()

