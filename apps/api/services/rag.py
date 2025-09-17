"""Lightweight RAG helper utilities.

Chroma + OpenAI embedding を利用可能な場合は活用し、未設定時は
インメモリの簡易スコアリングでフォールバックする。
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:  # pragma: no cover - optional dependency import
    import chromadb
    from chromadb.utils import embedding_functions
except ImportError:  # pragma: no cover
    chromadb = None  # type: ignore
    embedding_functions = None  # type: ignore

try:  # pragma: no cover
    from openai import OpenAI  # type: ignore
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore

_DATA_DIR = Path("data/rag")
_DEFAULT_COLLECTION = "autoeda_corpus"

_in_memory_store: List[Dict[str, Any]] = []
_chroma_client = None
_collection = None
_embedding_fn = None


def _ensure_chroma() -> Optional[Any]:
    global _chroma_client, _collection, _embedding_fn
    if chromadb is None:
        return None
    if _chroma_client is None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(_DATA_DIR))
    if _embedding_fn is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key and embedding_functions is not None:
            _embedding_fn = embedding_functions.OpenAIEmbeddingFunction(
                api_key=api_key,
                model_name=os.getenv("AUTOEDA_EMBEDDING_MODEL", "text-embedding-3-small"),
            )
    if _collection is None:
        _collection = _chroma_client.get_or_create_collection(
            name=_DEFAULT_COLLECTION,
            embedding_function=_embedding_fn,
        )
    return _collection


def ingest(documents: Iterable[Dict[str, Any]]) -> None:
    """Insert documents into the vector store (id, text, metadata)."""

    docs = list(documents)
    if not docs:
        return

    collection = _ensure_chroma()
    ids = [doc.get("id") or _stable_id(doc.get("text", "")) for doc in docs]
    texts = [doc.get("text", "") for doc in docs]
    metadatas = [doc.get("metadata", {}) for doc in docs]

    if collection:
        collection.upsert(ids=ids, documents=texts, metadatas=metadatas)
    else:
        _in_memory_store.extend({"id": id_, "text": text, "metadata": meta} for id_, text, meta in zip(ids, texts, metadatas))


def retrieve(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Return top_k documents for the query."""

    collection = _ensure_chroma()
    if collection:
        results = collection.query(query_texts=[query], n_results=top_k)
        docs = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        ids = results.get("ids", [[]])[0]
        return [
            {
                "id": doc_id,
                "text": doc,
                "metadata": meta or {},
            }
            for doc_id, doc, meta in zip(ids, docs, metadatas)
            if doc
        ]

    # fallback naive scoring
    scored = []
    terms = set(query.lower().split())
    for doc in _in_memory_store:
        text = doc.get("text", "")
        score = sum(1 for term in terms if term in text.lower())
        if score > 0:
            scored.append((score, doc))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [doc for _, doc in scored[:top_k]]


def load_default_corpus() -> None:
    """Seed the store with docs/requirements/ design excerpts if available."""

    corpus = []
    base = Path("docs")
    for name in ("requirements.md", "design.md"):
        path = base / name
        if path.exists():
            corpus.append(
                {
                    "id": f"doc:{name}",
                    "text": path.read_text(encoding="utf-8"),
                    "metadata": {"source": name},
                }
            )
    ingest(corpus)
