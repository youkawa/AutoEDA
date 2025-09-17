# services/

AutoEDA のバックエンド・ドメインロジックを将来ここに集約します。

- `orchestrator/` — LLM Agent / Evaluator（LangChain想定）
- `tools/` — `profile_api` / `stats_api` / `chart_api` / `pii_scan`
- `rag/` — 埋め込み・インデクシング・検索（Chroma想定）

現段階ではプレースホルダです。実装は `apps/api` から公開APIを介して参照します。

