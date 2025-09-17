import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


def fail(msg: str) -> None:
    print(f"[schema-check] {msg}")
    sys.exit(1)


def load_openapi() -> Dict[str, Any]:
    p = Path("dist/openapi.json")
    if not p.exists():
        fail("dist/openapi.json not found. Run schema:dump:openapi first.")
    return json.loads(p.read_text())


def deref(schema: Dict[str, Any], comps: Dict[str, Any]) -> Dict[str, Any]:
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/components/schemas/"):
            return schema
        key = ref.split("/")[-1]
        return comps.get(key, schema)
    return schema


def check_models(comps: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    # model -> {prop: expected_type}
    exp: Dict[str, Dict[str, str]] = {
        "EDAReport": {
            "summary": "object",
            "issues": "array",
            "distributions": "array",
            "keyFeatures": "array",
            "outliers": "array",
        },
        "ChartCandidate": {
            "id": "string",
            "type": "string",
            "explanation": "string",
            "source_ref": "object",
            "consistency_score": "number",
        },
        "Answer": {
            "text": "string",
            "references": "array",
            "coverage": "number",
        },
        "PrioritizedAction": {
            "title": "string",
            "impact": "number",
            "effort": "number",
            "confidence": "number",
            "score": "number",
        },
        "PIIScanResult": {
            "detected_fields": "array",
            "mask_policy": "string",
        },
        "LeakageScanResult": {
            "flagged_columns": "array",
            "rules_matched": "array",
        },
        "RecipeEmitResult": {
            "artifact_hash": "string",
            "files": "array",
        },
    }

    missing_models = [m for m in exp if m not in comps]
    prop_issues: List[str] = []

    for model, props in exp.items():
        if model not in comps:
            continue
        schema = comps[model]
        defined = schema.get("properties", {}) or {}
        for prop, expected in props.items():
            if prop not in defined:
                prop_issues.append(f"missing {model}.{prop}")
                continue
            prop_schema = deref(defined[prop], comps)
            actual_type = prop_schema.get("type")
            # arrays may be defined without type when $ref used; attempt to infer
            if not actual_type and "$ref" in defined[prop]:
                ref_schema = deref(defined[prop], comps)
                actual_type = ref_schema.get("type")
            if expected != "any" and actual_type != expected:
                prop_issues.append(
                    f"type mismatch {model}.{prop}: expected {expected}, got {actual_type}"
                )

        # extra: quick enum checks for a couple models
        if model == "ChartCandidate":
            t = defined.get("type", {})
            if t.get("enum") and set(t["enum"]) - {"bar", "line", "scatter"}:
                prop_issues.append("ChartCandidate.type has unexpected enum values")
        if model == "PIIScanResult":
            mp = defined.get("mask_policy", {})
            if mp.get("enum") and set(mp["enum"]) - {"MASK", "HASH", "DROP"}:
                prop_issues.append("PIIScanResult.mask_policy has unexpected enum values")

    return missing_models, prop_issues


def main() -> None:
    data = load_openapi()
    comps = data.get("components", {}).get("schemas", {})
    missing, issues = check_models(comps)
    errors: List[str] = []
    if missing:
        errors.append("Missing schemas: " + ", ".join(missing))
    if issues:
        errors.extend(issues)
    if errors:
        fail("\n" + "\n".join(" - " + e for e in errors))
    print("[schema-check] OpenAPI components strict check passed.")


if __name__ == "__main__":
    main()
