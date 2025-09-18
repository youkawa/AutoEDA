## AutoEDA アシスタント — 要件定義 (2025-09-18 更新)

- **目的**: CSV など表形式データを対象に、プロファイル生成から可視化提案、根拠付き Q&A、次アクション、品質監査、再現レシピまでを一気通貫で支援する。
- **対象ユーザー**: DS / DE / PM。社内データ辞書・規約を参照する RAG/LLM を想定するが、未設定時はツールのみで動作すること。
- **LLM 設計方針**: RAG (Chroma / in-memory), エージェントレス (直接 SDK 呼び出し)、構造化 JSON、数値はツール出力のみ採用。
- **非機能 (共通)**: groundedness ≥ 0.9、引用被覆率 ≥ 0.8、p95 レイテンシはストーリーごとの上限を維持、LLM 未設定時はフォールバック警告を表示。イベントログ (`data/metrics/events.jsonl`) に記録し `check_slo.py` で検証する。

---

## Capability U: データセット管理

### Story U1: CSV アップロードと登録 (バックログ / API 実装済み)

- **Given** ユーザーが `sales.csv` をアップロードする
- **When** `POST /api/datasets/upload` に渡す
- **Then** `dataset_id` を払い出し、`data/datasets/ds_xxxx.csv` に保存し、`index.json` にメタデータを追加する
- **受入れ基準**:
  - 100MB 超または 50 列超は `413`/`400` を返す
  - 登録後に `GET /api/datasets` で一覧へ反映
  - `.meta.json` に PII 初期値 (`MASK`, 空配列) を格納
- **実装状況**: API 完了 (`apps/api/main.py:95`)、UI 未実装 (`docs/wireframe.md` バックログ)

### Story U2: データセット一覧 (実装済み)

- **Given** `data/datasets/index.json` に 2 件登録済み
- **When** `GET /api/datasets` を呼び出す
- **Then** `{id, name, rows, cols}` の配列を返す
- **受入れ基準**: 0 件の場合でも 200 を返す、`packages/client-sdk` はフォールバックデータを提供
- **Observability**: なし (今後 `DatasetsListed` 等を追加検討)

---

## Capability A: データ概要レポート生成

### Story A1: 即時プロファイリング (実装済み)

- **Given** dataset_id が存在
- **When** `POST /api/eda {dataset_id}` を呼ぶ
- **Then** `EDAReport` (summary/distributions/key_features/outliers/data_quality_report/next_actions/references) を返す
- **受入れ基準**:
  - p95 レイテンシ ≤ 10 秒 (`EDAReportGenerated.duration_ms`)
  - groundedness ≥ 0.9（LLM 成功時）
  - フォールバック時は references に `tool:` を含め、UI が警告バナーを表示
  - 欠損率 30%以上の列は `data_quality_report.issues[]` に追加
  - イベント: `EDAReportGenerated` (dataset_id, sample_ratio, groundedness, duration_ms, fallback_applied)
- **実装参照**: `apps/api/services/tools.py::profile_api`, `apps/api/services/orchestrator.py`

### Story A2: チャート自動提案 (実装済み)

- **When** `POST /api/charts/suggest {dataset_id, k=5}`
- **Then** `charts[]` を返し、各項目に `consistency_score >= 0.95` を付与
- **受入れ基準**:
  - 説明文に `source_ref` を含める
  - trend と診断値 (correlation) が矛盾しない (`evaluator.consistency_ok`)
  - p95 レイテンシ ≤ 6 秒 (`ChartsSuggested.duration_ms`)
- **Observability**: `ChartsSuggested {dataset_id, k, count, duration_ms}`

---

## Capability B: 根拠付き Q&A と次アクション

### Story B1: 根拠付き回答 (実装済み / LLM 未接続時はテンプレ)

- **When** `POST /api/qna {dataset_id, question}`
- **Then** `answers[]` を返し、coverage ≥ 0.8、引用を重複排除
- **受入れ基準**:
  - 数値はツール出力（モックでは固定文言）
  - イベント: `EDAQueryAnswered {dataset_id, coverage, duration_ms}`
  - LLM を有効化した場合は `orchestrator._invoke_llm_agent` が JSON をマージ

### Story B1-2: 追質問フォローアップ (実装済み)

- **When** `POST /api/followup`
- **Then** coverage を 0.85 以上に保ち、回答冒頭に `フォローアップ:` を付与

### Story B2: 次アクション優先度付け (実装済み)

- **When** `POST /api/actions/prioritize`
- **Then** 入力配列に対して WSJF / RICE / score を算出し降順ソート
- **受入れ基準**:
  - score = WSJF。impact/effort/confidence は 0..1 にクリップ
  - イベント: `ActionsPrioritized {dataset_id, count}`

---

## Capability C: 品質・セキュリティ検査

### Story C1: PII 検出とマスキング (実装済み)

- **When** `POST /api/pii/scan {dataset_id, columns}`
- **Then** `detected_fields`, `mask_policy`, `masked_fields`, `updated_at` を返す
- **受入れ基準**:
  - デフォルトは email/phone/ssn を探索
  - `apply` 実行後に `.meta.json` が更新され、`pii.scan` が最新状態を返す
  - イベント: `PIIMasked {dataset_id, detected_fields, mask_policy}`

### Story C2: リーク検査と対応 (実装済み)

- **When** `POST /api/leakage/scan`
- **Then** `flagged_columns`, `rules_matched`, `excluded_columns`, `acknowledged_columns` を返す
- **受入れ基準**:
  - `resolve` の action = exclude/acknowledge/reset で `.meta.json` を更新
  - イベント: `LeakageRiskFlagged {dataset_id, flagged, rules_matched}` / `LeakageResolutionApplied`

---

## Capability D: 再現レシピ

### Story D1: ノートブック/SQL/JSON 生成 (実装済み)

- **When** `POST /api/recipes/emit`
- **Then** `artifact_hash`, `files[]`, `summary`, `measured_summary` を返す
- **受入れ基準**:
  - `recipes.compute_summary` の結果が ±1% 以内 (`recipes.within_tolerance`)
  - 再現誤差が閾値超過の場合は 400 (例外) を返す
  - イベント: `EDARecipeEmitted {artifact_hash, files}`

---

## Capability S: システム設定 / オペレーション

### Story S1: LLM 資格情報管理 (実装済み)

- **When** `GET /api/credentials/llm` を呼ぶ
- **Then** 有効プロバイダ (`provider`)、設定状態 (`configured`)、各プロバイダの状態を返す

- **When** `POST /api/credentials/llm {provider, api_key}`
- **Then** `config/credentials.json` (または `AUTOEDA_CREDENTIALS_FILE` で指定されたファイル) を更新する
- **受入れ基準**:
  - 空キーは 400 を返す (`CredentialUpdateRequest._ensure_api_key`)
  - 成功時は 204 を返し `LLMCredentialsUpdated` イベントを記録
  - Settings ページで状態が即時反映

### Story S2: メトリクス監査 (実装済み)

- **When** CLI で `python3 apps/api/scripts/check_slo.py` を実行
- **Then** `data/metrics/events.jsonl` を読み、閾値違反時に exit code 1 を返す
- **When** `python3 apps/api/scripts/check_rag.py` を実行
- **Then** RAG ゴールデンセットの欠落クエリを列挙する

---

## KPI / モニタリング指標

| 指標 | 目標 | 取得方法 |
| ---- | ---- | -------- |
| groundedness | ≥ 0.9 | `EDAReportGenerated.groundedness` (LLM 成功時) |
| 引用被覆率 | ≥ 0.8 | Q&A 応答 (`coverage`)、Actions/Recipes は参照表示で確認 |
| p95 レイテンシ | A1: ≤10s / A2: ≤6s / B1: ≤4s / C1: ≤4s / C2: ≤5s / D1: ≤8s | `check_slo.py` |
| LLM フォールバック率 | <10% (開発中) | `EDAReportGenerated.fallback_applied` |
| PII/リーク検出完了率 | 100% | `.meta.json` の `updated_at` を追跡 |
| レシピ再現成功率 | 100% | `recipes.within_tolerance` 成功/失敗ログ |

---

## セキュリティ / コンプライアンス

- Secrets は `config/credentials.json` にのみ保存し、リポジトリへコミットしない。
- PII/リークの操作履歴は `.meta.json` に残し、手動でのデータ持ち出し時に参照。
- Playwright/E2E ではモックデータのみを扱う。

---

## トレーサビリティ

| Story | 主要コード | UI | テスト |
| ------ | ---------- | -- | ------ |
| U2 | `apps/api/main.py:109`, `storage.list_datasets` | `DatasetsPage` | `tests/python/test_storage.py` (存在する場合) |
| A1 | `orchestrator.generate_eda_report` | `EdaPage` | `tests/python/test_orchestrator.py` (LLM 無し) |
| A2 | `tools.chart_api`, `evaluator.consistency_ok` | `ChartsPage` | `tests/python/test_charts.py` (TODO) |
| B1/B2 | `tools.stats_qna`, `tools.prioritize_actions` | `QnaPage`, `ActionsPage` | `packages/client-sdk` のユニットテスト (TODO) |
| C1/C2 | `tools.pii_scan`, `tools.leakage_scan` | `PiiPage`, `LeakagePage` | `tests/python/test_pii.py`, `test_leakage.py` (TODO) |
| D1 | `tools.recipe_emit`, `recipes.*` | `RecipesPage` | `tests/python/test_recipes.py` |
| S1 | `config.py`, `SettingsPage` | `SettingsPage` | `tests/python/test_credentials.py` |

テストが未整備の箇所は `TODO` として明記し、`docs/task.md` にタスクを追加する。

---

## 変更履歴

- 2025-09-18: 実装内容と同期。LangChain への依存を削除。LLM 資格情報・フォールバック・メトリクス要件を追加。
- 2025-09-15: 初版 (仕様草案)。
