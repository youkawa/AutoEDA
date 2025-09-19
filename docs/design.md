# 設計文書（High-Level Design）— AutoEDA（プロトタイプ v1）

本設計は `docs/requirements.md` を正典として反映し、現時点の実装 (`apps/api`, `apps/web`, `packages/*`) に基づく情報をまとめる。プロトタイプはローカル実行を前提とし、LLM が未設定の場合はすべてのストーリーでツール主導のフォールバックを行う。

---

## 1. 目的 / スコープ / ユーザー

- **目的**: CSV 等の表形式データをアップロードし、プロファイル生成 (A1) → チャート提案 (A2) → 根拠付き Q&A (B1) → 次アクション優先度付け (B2) → 品質/リーク検査 (C1/C2) → 再現レシピ生成 (D1) までを自動化する。
- **スコープ**: ローカル PC 上での FastAPI + React 実行、API/SDK/UI/テストの統合。インフラプロビジョニングや本番運用は範囲外。
- **ユーザー**: データサイエンティスト (DS)、データエンジニア (DE)、プロダクトマネージャー (PM)。

---

## 2. ハイレベルアーキテクチャ

### 2.1 技術スタック

| レイヤー | 採用技術 | 備考 |
| -------- | -------- | ---- |
| フロントエンド | React 18 + Vite + React Router | `/apps/web`。API 呼び出しは `packages/client-sdk` 経由。
| バックエンド | FastAPI + Pydantic + Uvicorn | `/apps/api/main.py` がエントリポイント。
| サービス層 | Python モジュール (`apps/api/services/*.py`) | プロファイル、PII、リーク、レシピ、RAG、メトリクスを分離。
| LLM 連携 | OpenAI / Google Gemini SDK (オプション) | `apps/api/services/orchestrator.py` が直接 SDK を呼び出す。LangChain は未使用。
| RAG | Chroma PersistentClient (任意) + OpenAI Embedding | 未設定時はインメモリ検索にフォールバック (`rag.py`)。
| メトリクス | 独自 JSON Lines (`data/metrics/events.jsonl`) | `metrics.py` が収集し、Python スクリプトで SLO を評価。
| スキーマ共有 | Zod | `packages/schemas` が API/フロント間で型を共有。

### 2.2 モジュール責務

| モジュール | 役割 | 主なファイル |
| ---------- | ---- | ------------ |
| API ルータ | REST エンドポイントの公開 | `apps/api/main.py` |
| プロファイリング | CSV 読み込み、欠損/外れ値計算、次アクション算出 | `apps/api/services/tools.py` (`profile_api`) |
| チャート提案 | 分布/時系列/カテゴリ/相関分析と候補生成 | `apps/api/services/tools.py` (`chart_api`) |
| Q&A | 質問応答テンプレート生成、追質問サポート | `apps/api/services/tools.py` (`stats_qna`, `followup`) |
| 優先度付け | WSJF / RICE 計算 | `apps/api/services/tools.py` (`prioritize_actions`) |
| PII / リーク | 正規表現 + pandas による簡易検査とメタ更新 | `apps/api/services/tools.py` (`pii_scan`, `apply_pii_policy`, `leakage_*`) |
| レシピ生成 | `recipe.json` / `eda.ipynb` / `sampling.sql` / ハッシュ算出 | `apps/api/services/tools.py` (`recipe_emit`), `recipes.py` |
| オーケストレーション | ツール結果の統合、LLM 呼び出し、フォールバック制御 | `apps/api/services/orchestrator.py` |
| RAG | ドキュメント ingest / retrieve, フォールバック検索 | `apps/api/services/rag.py` |
| メトリクス | イベント集約、SLO 判定補助 | `apps/api/services/metrics.py` |
| ストレージ | データセット/メタ保存 (`data/datasets`) | `apps/api/services/storage.py` |
| フロント SDK | Fetch + フォールバック、LLM 設定呼び出し | `packages/client-sdk/src/index.ts` |
| UI キット | 共通 UI 要素 (Button) | `packages/ui-kit/src/index.tsx` |

### 2.3 C4 図

**System Context**

```mermaid
graph LR
  user["DS/DE/PM"] --> web["AutoEDA Web UI (React)"]
  web --> sdk["@autoeda/client-sdk"]
  sdk --> api["AutoEDA API (FastAPI)"]
  api --> tools["Services: tools.py / orchestrator.py / rag.py"]
  tools --> datasets["data/datasets" ]
  tools --> recipes["data/recipes"]
  tools --> metrics["data/metrics/events.jsonl"]
  tools --> ragstore["Chroma / In-memory Store"]
  tools --> llm["OpenAI / Gemini (任意)"]
```

**Container**

```mermaid
graph TB
  subgraph Frontend
    FE["apps/web (React)"]
    SDK["packages/client-sdk"]
    UIKIT["packages/ui-kit"]
  end
  subgraph Backend
    API["FastAPI Router"]
    SRV["services/*.py"]
    CFG["config/credentials.json"]
  end
  subgraph Data
    DS["data/datasets"]
    REC["data/recipes"]
    MET["data/metrics"]
    RAG["Chroma / In-memory"]
  end
  FE --> SDK
  SDK --> API
  API --> SRV
  SRV --> DS
  SRV --> REC
  SRV --> MET
  SRV --> RAG
  SRV --> CFG
```

**Component (API サービス層)**

```mermaid
graph LR
  API -.-> UploadController["/api/datasets/upload"]
  API -.-> DatasetController["/api/datasets"]
  API -.-> EDAController["/api/eda"]
  API -.-> ChartsController["/api/charts/suggest, /api/charts/generate, /api/charts/generate:batch, /api/charts/jobs/{id}, /api/charts/batches/{id}"]
  API -.-> QnAController["/api/qna, /api/followup"]
  API -.-> ActionsController["/api/actions/prioritize"]
  API -.-> PIIController["/api/pii/*"]
  API -.-> LeakageController["/api/leakage/*"]
  API -.-> RecipesController["/api/recipes/*"]
  API -.-> CredentialsController["/api/credentials/llm"]

  EDAController --> Orchestrator["orchestrator.generate_eda_report"]
  Orchestrator --> ProfileTool["tools.profile_api"]
  Orchestrator --> PIITool["tools.pii_scan"]
  Orchestrator --> LeakageTool["tools.leakage_scan"]
  Orchestrator --> RAG["rag.retrieve"]
  Orchestrator --> LLM["OpenAI / Gemini SDK"]
  Orchestrator --> Metrics["metrics.record_event"]

  ChartsController --> ChartsService["services/charts.py (予定)"]
  ChartsService --> CodeGen["LLM(JSON): language/library/code/outputs"]
  ChartsService --> Sandbox["SandboxRunner (NW遮断/制限)"]
  ChartsService --> Store["data/charts/<job_id>/*"]
  ChartsService --> Metrics2["metrics.record_event"]
```

---

## 3. データフローとストーリー別詳細

### 3.1 A1: プロファイル生成 (`POST /api/eda`)

1. `tools.profile_api` が `data/datasets/<id>.csv` を pandas または CSV 直読みで解析。欠損・外れ値・次アクションを算出。
2. `tools.pii_scan` / `tools.leakage_scan` を安全に呼び、参照へ追加。
3. LLM 設定が存在すれば `orchestrator._invoke_llm_agent` が補足要約を生成。失敗時/未設定時は `tool:` 参照付きフォールバックを組み立て。
4. `metrics.record_event("EDAReportGenerated", …)` が所要時間と groundedness を記録。
5. 応答は `EDAReport` スキーマ（`packages/schemas`）で検証される。

### 3.2 A2: チャート提案 (`POST /api/charts/suggest`)

- `tools.chart_api` がプロファイル情報と 5,000 行プレビューを元に候補チャートを生成。
- `evaluator.consistency_ok` が `consistency_score >= 0.95`、トレンド整合性、相関の符号を検証。
- メトリクスとして候補数と処理時間を記録。

### 3.3 B1/B2: Q&A と次アクション

- `tools.stats_qna` がテンプレート回答を生成。LLM 未設定でもハルシネーションを防ぐため数値はツール由来のみ。
- `tools.followup` は同じ回答を再利用し、カバレッジを 0.85 以上に補正。
- `tools.prioritize_actions` が WSJF / RICE を計算し、`metrics.record_event("ActionsPrioritized", …)` に記録。

### 3.4 C1/C2: PII・リーク検査

- `tools.pii_scan` は pandas + 正規表現で email/phone/ssn を検出。結果は `storage.update_pii_metadata` で保存。
- `tools.leakage_scan` は既知の疑似カラムを返し、`resolve_leakage` がメタを更新。選択状態は API 応答に反映。

### 3.5 D1: レシピ出力

- `tools.recipe_emit` がプロファイル結果を再利用し `recipes.build_artifacts` で `recipe.json` / `eda.ipynb` / `sampling.sql` を生成。
- 生成物の SHA-256 ハッシュを 16 文字で返し、再計測統計を ±1% の許容内で照合。

---

### 3.6 H: チャート生成（LLM コード生成・安全実行・一括処理）

requirements_v2（Capability H: CH-01〜CH-21）に基づき、提案→生成→表示→一括生成の基本設計を定義する。

#### 3.6.1 概要

- 単発生成（CH-01〜08）と一括生成（CH-20/21）を共通の `ChartsService` で処理。
- 生成コードはネットワーク遮断・CPU/メモリ/時間制限付きのサンドボックスで実行。成果は PNG/SVG または Vega-Lite JSON。
- LLM 応答が空/不正/ブロック時はテンプレート可視化へ段階フォールバック（CH-05, CH-13）。

#### 3.6.2 API 契約（ドラフト）

- `POST /api/charts/generate` → 単発ジョブを登録し `{job_id,status}` を返す。
- `POST /api/charts/generate:batch` → バッチを登録し `{batch_id,submitted}` を返す（並列度は環境で可変）。
- `GET /api/charts/jobs/{job_id}` / `GET /api/charts/batches/{batch_id}` → 進捗/結果/エラーを返す。
- ChartResult 例: `{ language, library, code, seed, outputs:[{type:'image'|'vega', mime, content(base64|json)}] }`

#### 3.6.3 サービス構成（Backend）

- `services/charts.py`（新設）
  - `suggest()`（内部で `tools.chart_api` を使用）
  - `enqueue_generate(item) -> job_id`
  - `enqueue_batch(items, parallelism) -> batch_id`
  - `get_job(job_id)` / `get_batch(batch_id)`
- `CodeGen` … LLM で構造化 JSON を取得。`orchestrator` の JSON 強制/クレンジングを再利用。
- `SandboxRunner` … 許可パッケージのみ、NW遮断、`timeout=10s`, `mem=512MB` を強制。
- ストレージ … `data/charts/<job_id>/{code.py,result.json,image.png,spec.json,meta.json}` を保存。

設定（ENV 既定）: `AUTOEDA_CHARTS_PARALLELISM=3`, `AUTOEDA_CHART_EXEC_TIMEOUT_SEC=10`, `AUTOEDA_CHART_EXEC_MEM_MB=512`, `AUTOEDA_SANDBOX_ALLOW_PKGS="pandas,numpy,altair,vega-lite,matplotlib"`, `AUTOEDA_CHARTS_MAX_BATCH_SIZE=20`。

#### 3.6.4 フロントエンド（ChartsPage）

- 各提案カード: 「チャート作成」ボタン、進捗、結果タブ（可視化/コード/メタ）。
- 複数選択（CH-20）: チェックボックス＋ヘッダー「全選択/一括生成」バー（選択数バッジ表示）。
- 一括生成（CH-21）: バッチ進捗（N中M）と個別進捗を同時に表示。失敗は個別に再試行可。
- A11y: role=checkbox, aria-checked, キーボード操作対応、モーション抑制。

#### 3.6.5 シーケンス（単発）

```mermaid
sequenceDiagram
  participant UI as Web UI
  participant SDK as client-sdk
  participant API as FastAPI
  participant SVC as ChartsService
  participant LLM as LLM
  participant SBX as Sandbox
  participant ST as Storage
  UI->>SDK: POST /api/charts/generate
  SDK->>API: generate(item)
  API->>SVC: enqueue(item)
  SVC->>LLM: JSON(code/spec)
  alt success
    SVC->>SBX: run(code, dataset)
    SBX->>SVC: outputs
  else fallback
    SVC->>SVC: TemplateGen
  end
  SVC->>ST: persist
  API-->>SDK: {status:'succeeded', result}
  SDK-->>UI: render
```

#### 3.6.6 シーケンス（バッチ・並列度3）

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant SVC
  UI->>API: POST /generate:batch (k items)
  API->>SVC: create batch(parallel=3)
  loop workers
    SVC->>SVC: dequeue -> generate(item)
  end
  SVC-->>API: {done, failed, running}
  API-->>UI: progress + per-item status
```

#### 3.6.7 エラー処理 / メトリクス

- 人間可読エラー: Gemini の安全フィルタはカテゴリ併記、OpenAI は JSON 不整合/空応答の明示。
- 監視イベント: `ChartGenerationRequested/Started/Progress/Completed/Failed`, `ChartBatch*`（dataset_id/job_id/batch_id を必須付帯）。
- KPI: バッチ成功率、平均レイテンシ、失敗理由内訳、VR 差分率。


## 4. フォールバックとエラー処理

| シナリオ | 対応 |
| -------- | ---- |
| LLM 未設定 / SDK 不在 / 呼び出し失敗 | `orchestrator.generate_eda_report` がツールのみの要約へフォールバックし、`fallback_applied` フラグをメトリクスに記録。フロントは参照に `tool:` プレフィックスが含まれている場合に警告バナーを表示。 |
| Chroma or Embedding 未利用 | `rag.retrieve` がインメモリ全文検索で代替。 |
| 100MB 超の CSV / 50 列超 | `storage.save_upload` が `HTTP 413` を返し部分ファイルを削除。 |
| pandas 非インストール | `tools.profile_api` が軽量 CSV パスを実行。 |
| レシピ再計測ズレ | `recipes.within_tolerance` が失敗した場合に `ValueError` を送出。API が 400 を返却。 |

---

## 5. 非機能要件とメトリクス

- **SLO / SLA**: `docs/requirements.md` に記載される p95 レイテンシ・groundedness ≥ 0.9・引用被覆率 ≥ 0.8 を満たすこと。
- **メトリクス収集**: すべての主要エンドポイントで `metrics.record_event` を呼び出し、`data/metrics/events.jsonl` に追記。
- **検証スクリプト**: `check_slo.py` がイベントログから p95 を計算、`check_rag.py` がゴールデンセットの漏れを検出。
- **テレメトリ再利用**: `metrics.evaluate_golden_queries` などが #TODO で拡張される余地あり。

---

## 6. セキュリティ / コンフィグ

- **資格情報**: `config/credentials.json` に保存。`apps/api/config.py` が JSON を読み込み、`AUTOEDA_CREDENTIALS_FILE` 環境変数で別ファイルに切り替え可能。
- **データ取扱い**: PII / リーク判定は `data/datasets/<id>.meta.json` に保持。ファイル共有時は手動でマスキングされた CSV のみを配布する。
- **ログ**: LLM 応答や原文書をログに残さない。`metrics.persist_event` も最小限の統計のみ保存。
- **依存関係**: `apps/api/requirements.txt` に明示。可搬性を確保するため Docker 化は `infra/README.md` にタスクとして記載。

---

## 7. 今後の改善候補

1. **アップロード UI の実装**: 現状 API のみ。`apps/web` から `POST /api/datasets/upload` を呼び出すフォームを追加予定。
2. **Storybook 導入**: `docs/storybook.md` 参照。コンポーネント分解を進めて UI 品質を向上。
3. **Chroma シードの自動化**: 現状は `docs` を読み込み。専用 CLI を用意し、社内ドキュメントの取り込みを自動化する。
4. **Docker/CI**: `infra/README.md` に記載のとおり、固定タグのサンドボックスイメージを整備。

本設計を基に、要求されたストーリーの非機能条件 (groundedness / 引用被覆率 / p95 など) を満たすよう実装を継続する。
