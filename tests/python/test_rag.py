import json

from apps.api.services import rag
from apps.api.scripts import check_rag


def test_rag_in_memory_retrieve(monkeypatch):
    # ensure clean state
    monkeypatch.setattr(rag, "_in_memory_store", [])
    monkeypatch.setattr(rag, "_chroma_client", None)
    monkeypatch.setattr(rag, "_collection", None)

    docs = [
        {"id": "d1", "text": "EDA の groundedness 要件", "metadata": {"source": "requirements"}},
        {"id": "d2", "text": "チャート整合性のしきい値は 0.95", "metadata": {"source": "design"}},
    ]
    rag.ingest(docs)

    results = rag.retrieve("整合性 0.95")
    assert results
    assert results[0]["id"] == "d2"


def test_rag_load_default_corpus(monkeypatch, tmp_path):
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    design = docs_dir / "design.md"
    design.write_text("AutoEDA 設計", encoding="utf-8")
    req = docs_dir / "requirements.md"
    req.write_text("AutoEDA 要件", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(rag, "_in_memory_store", [])
    monkeypatch.setattr(rag, "_chroma_client", None)
    monkeypatch.setattr(rag, "_collection", None)

    rag.load_default_corpus()
    results = rag.retrieve("要件")
    assert any("requirements.md" in res.get("metadata", {}).get("source", "") for res in results)


def test_rag_golden_queries(monkeypatch, tmp_path):
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "requirements.md").write_text("引用被覆率 0.8 を満たす", encoding='utf-8')
    (docs_dir / "design.md").write_text("整合性は 0.95 以上", encoding='utf-8')

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(rag, "_in_memory_store", [])
    monkeypatch.setattr(rag, "_chroma_client", None)
    monkeypatch.setattr(rag, "_collection", None)

    rag.load_default_corpus()

    report = rag.evaluate_golden_queries([
        {"id": "coverage", "query": "引用被覆率", "expects": ["requirements.md"]},
        {"id": "consistency", "query": "整合性", "expects": ["design.md"]},
    ])

    assert report["missing"] == []

    failure = rag.evaluate_golden_queries([
        {"id": "absent", "query": "存在しない情報", "expects": ["docs.md"]},
    ])

    assert failure["missing"] == ["absent"]


def test_check_rag_main_success(monkeypatch, tmp_path):
    queries = tmp_path / "golden.json"
    queries.write_text(
        json.dumps([
            {"id": "q1", "query": "A", "expects": ["docA"]},
        ]),
        encoding="utf-8",
    )

    monkeypatch.setenv("AUTOEDA_RAG_GOLDEN_PATH", str(queries))
    monkeypatch.setattr(rag, "_in_memory_store", [])
    monkeypatch.setattr(rag, "_collection", None)
    monkeypatch.setattr(rag, "_chroma_client", None)

    def fake_load_default():
        rag.ingest([
            {"id": "doc:req", "text": "A", "metadata": {"source": "docA"}},
        ])

    monkeypatch.setattr(rag, "load_default_corpus", fake_load_default)

    exit_code = check_rag.main([str(queries)])
    assert exit_code == 0


def test_check_rag_main_failure(monkeypatch, tmp_path):
    queries = tmp_path / "golden.json"
    queries.write_text(
        json.dumps([
            {"id": "q1", "query": "B", "expects": ["docB"]},
        ]),
        encoding="utf-8",
    )

    monkeypatch.setenv("AUTOEDA_RAG_GOLDEN_PATH", str(queries))
    monkeypatch.setattr(rag, "_in_memory_store", [])
    monkeypatch.setattr(rag, "_collection", None)
    monkeypatch.setattr(rag, "_chroma_client", None)
    monkeypatch.setattr(rag, "load_default_corpus", lambda: rag.ingest([]))

    exit_code = check_rag.main([str(queries)])
    assert exit_code == 1
