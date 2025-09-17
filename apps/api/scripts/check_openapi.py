import json
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(f"[schema-check] {msg}")
    sys.exit(1)


def main() -> None:
    p = Path('dist/openapi.json')
    if not p.exists():
        fail('dist/openapi.json not found. Run schema:dump:openapi first.')
    data = json.loads(p.read_text())
    comps = data.get('components', {}).get('schemas', {})
    required_models = {
        'EDAReport': ['summary', 'issues', 'distributions', 'keyFeatures', 'outliers'],
        'ChartCandidate': ['id', 'type', 'explanation', 'source_ref', 'consistency_score'],
        'Answer': ['text', 'references', 'coverage'],
        'PrioritizedAction': ['title', 'impact', 'effort', 'confidence', 'score'],
        'PIIScanResult': ['detected_fields', 'mask_policy'],
        'LeakageScanResult': ['flagged_columns', 'rules_matched'],
    }
    missing_models = [m for m in required_models.keys() if m not in comps]
    if missing_models:
        fail('Missing schemas: ' + ', '.join(missing_models))
    # Properties check
    prop_failures = []
    for name, props in required_models.items():
        defined = comps[name].get('properties', {})
        for prop in props:
            if prop not in defined:
                prop_failures.append(f"{name}.{prop}")
    if prop_failures:
        fail('Missing properties: ' + ', '.join(prop_failures))
    print('[schema-check] OpenAPI components basic check passed.')


if __name__ == '__main__':
    main()

