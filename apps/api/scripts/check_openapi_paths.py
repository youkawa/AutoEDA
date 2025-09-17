import sys
import json
from pathlib import Path


def fail(msg: str) -> None:
    print(f"[openapi-paths] {msg}")
    sys.exit(1)


def load(path: str = "dist/openapi.json"):
    p = Path(path)
    if not p.exists():
        fail("dist/openapi.json not found. Run schema:dump:openapi first.")
    return json.loads(p.read_text())


def ensure_path(data, path: str):
    paths = data.get("paths", {})
    if path not in paths:
        fail(f"missing path: {path}")
    return paths[path]


def schema_ref_of_post_200(path_item) -> str:
    post = path_item.get("post") or {}
    resp = post.get("responses", {}).get("200", {})
    content = resp.get("content", {}).get("application/json", {})
    schema = content.get("schema", {})
    return schema.get("$ref", "")


def main() -> None:
    data = load()
    # /api/charts/suggest -> ChartsSuggestResponse
    ch = ensure_path(data, "/api/charts/suggest")
    ref = schema_ref_of_post_200(ch)
    if not ref.endswith("/ChartsSuggestResponse"):
        fail("/api/charts/suggest 200 schema must be $ref to ChartsSuggestResponse")

    # /api/qna -> QnAResponse
    qn = ensure_path(data, "/api/qna")
    ref = schema_ref_of_post_200(qn)
    if not ref.endswith("/QnAResponse"):
        fail("/api/qna 200 schema must be $ref to QnAResponse")

    # /api/recipes/export exists
    ensure_path(data, "/api/recipes/export")
    print("[openapi-paths] required paths and response refs OK.")


if __name__ == "__main__":
    main()

