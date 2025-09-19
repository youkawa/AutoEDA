# AutoEDA 画面/状態図 (2025-09-19 時点)

`docs/requirements.md` と `docs/requirements_v2.md`（Capability H: CH-01〜CH-21）を反映し、現行実装 (`apps/web/src/pages/*`)＋設計 (`docs/design.md`) に基づく図を提供する。React Router によるシングルページ構成で、サイドバー (`App.tsx`) から主要ページへ遷移する。

---

## 1. サイトマップ (Router)

```mermaid
graph LR
  Home[Home /];
  Datasets[Datasets /datasets];
  Settings[Settings /settings];
  EDA[EDA Summary /eda/{id}];
  Charts[Charts /charts/{id}];
  ChartsBulk[Bulk select & generate];
  QnA[QnA /qna/{id}];
  Actions[Next Actions /actions/{id}];
  PII[PII /pii/{id}];
  Leakage[Leakage /leakage/{id}];
  Recipes[Recipes /recipes/{id}];

  Home --> Datasets;
  Datasets --> EDA;
  EDA --> Charts;
  EDA --> QnA;
  EDA --> Actions;
  EDA --> PII;
  EDA --> Leakage;
  EDA --> Recipes;
  Charts --> Recipes;
  Charts --> ChartsBulk;
  Actions --> Recipes;
  Settings -.-> API[API /api/credentials/llm];
```

---

## 2. メインフロー (A1→A2→B1/B2→D1) と新規 H（チャート生成）

```mermaid
sequenceDiagram
  participant User as ユーザー
  participant UI as React UI
  participant SDK as client-sdk
  participant API as FastAPI

  User->>UI: Datasets ページを開く
  UI->>SDK: listDatasets()
  SDK->>API: GET /api/datasets
  API-->>SDK: データセット一覧
  SDK-->>UI: datasets[]
  User->>UI: データセット選択
  UI->>SDK: getEDAReport(datasetId)
  SDK->>API: POST /api/eda
  API->>API: orchestrator.generate_eda_report
  API-->>SDK: EDAReport
  SDK-->>UI: レポート表示 (fallback 有無バナー)

  User->>UI: 可視化を表示
  UI->>SDK: suggestCharts(datasetId)
  SDK->>API: POST /api/charts/suggest
  API-->>SDK: {charts:[]}
  SDK-->>UI: チャート候補 (consistency>=0.95)

  User->>UI: 質問を送信
  UI->>SDK: askQnA(datasetId, question)
  SDK->>API: POST /api/qna
  API-->>SDK: answers[] (coverage>=0.8)
  SDK-->>UI: 回答/引用

  User->>UI: Next Actions を確認
  UI->>SDK: prioritizeActions(datasetId, items)
  SDK->>API: POST /api/actions/prioritize
  API-->>SDK: ranked[]
  SDK-->>UI: WSJF/RICE 表示

  User->>UI: レシピ生成
  UI->>SDK: emitRecipes(datasetId)
  SDK->>API: POST /api/recipes/emit
  API-->>SDK: RecipeEmitResult (artifact_hash, measured_summary)
  SDK-->>UI: 生成結果 + ±1% 乖離警告
```

---

### 2A. H（単発）チャート生成フロー（CH-01〜CH-08）

```mermaid
sequenceDiagram
  participant User as ユーザー
  participant UI as ChartsPage
  participant SDK as client-sdk
  participant API as FastAPI
  participant SVC as ChartsService
  participant LLM as LLM (OpenAI/Gemini)
  participant SBX as SandboxRunner
  participant ST as Storage

  User->>UI: 提案カードで「チャート作成」
  UI->>SDK: POST /api/charts/generate {dataset_id, spec_hint, columns}
  SDK->>API: /api/charts/generate
  API->>SVC: enqueue(item)
  SVC->>LLM: 構造化JSON生成 (language/library/code/outputs)
  alt success
    SVC->>SBX: コード実行 (NW遮断/timeout/mem制限)
    SBX-->>SVC: outputs (PNG|Vega-Lite)
  else 失敗/ブロック/空
    SVC->>SVC: TemplateGen フォールバック
  end
  SVC->>ST: code/result/spec/meta を保存
  API-->>SDK: {status:'succeeded', result}
  SDK-->>UI: プレビュー表示（可視化/コード/メタ）
```

### 2B. H（一括）チャート生成フロー（CH-20/CH-21）

```mermaid
sequenceDiagram
  participant User as ユーザー
  participant UI as ChartsPage(選択バー)
  participant SDK as client-sdk
  participant API as FastAPI
  participant SVC as ChartsService

  User->>UI: 複数チェック→「一括生成」
  UI->>SDK: POST /api/charts/generate:batch {items[], parallelism?}
  SDK->>API: /api/charts/generate:batch
  API-->>SDK: {batch_id, submitted}
  loop Poll status
    SDK->>API: GET /api/charts/batches/{batch_id}
    API-->>SDK: {done, total, items:[{job_id,status}]}
    SDK-->>UI: バッチ進捗 N中M と個別進捗を更新
  end
  Note over UI: 失敗は個別再試行（最大3回/指数バックオフ）
```

---

## 3. 品質フロー (C1/C2)

```mermaid
graph TD
  PIIPage[PII ページ] -->|初期ロード| PiiScan[POST /api/pii/scan]
  PiiScan --> Detected{検出フィールドあり?}
  Detected -->|Yes| Toggle[チェックボックスで選択]
  Toggle --> Apply[POST /api/pii/apply]
  Apply --> Refresh[再度 /api/pii/scan]
  Refresh --> PIIPage
  Detected -->|No| PIIPage

  LeakagePage[Leakage ページ] --> LeakScan[POST /api/leakage/scan]
  LeakScan --> Flags{flagged_columns}
  Flags -->|Yes| Select[チェックボックス]
  Select --> Action[exclude / acknowledge / reset]
  Action --> Resolve[POST /api/leakage/resolve]
  Resolve --> ReScan[再度 /api/leakage/scan]
  ReScan --> LeakagePage
  Flags -->|No| LeakagePage
```

---

## 4. 設定フロー (S1: LLM 資格情報)

```mermaid
sequenceDiagram
  participant UI as SettingsPage
  participant SDK as client-sdk
  participant API as FastAPI
  participant Config as config/credentials.json

  UI->>SDK: getLlmCredentialStatus()
  SDK->>API: GET /api/credentials/llm
  API-->>SDK: {provider, configured, providers}
  SDK-->>UI: ステータス表示
  User->>UI: API Key を入力
  UI->>SDK: setLlmCredentials(provider, apiKey)
  SDK->>API: POST /api/credentials/llm
  API->>Config: set_llm_credentials()
  API-->>SDK: 204 No Content
  SDK-->>UI: 完了メッセージ
```

---

## 5. 画面別要素 (実装済み/計画中コンポーネント)

| 画面 | 主な表示要素 | API 呼び出し | 備考 |
| ---- | ------------ | ------------ | ---- |
| Home | 説明文のみ | なし | アップロード UI は未実装（バックログ） |
| Datasets | データセット一覧 (`Button` with variant="ghost") | `listDatasets()` | モックデータでフォールバック可能 |
| EDA | Summary/Distributions/QualityIssues/NextActions、引用ビュー切替 | `getEDAReport()` | `tool:` 参照でフォールバック警告 |
| Charts | チャート候補一覧、診断値表示、チェックボックス、一括生成バー | `suggestCharts()` / `generateChart()` / `generateChartsBatch()` | consistency を百分率表示。選択数バッジと進捗（N/M）表示 |
| Q&A | 入力フォーム、回答、引用 | `askQnA()` | coverage を表示 |
| Actions | 優先度付きリスト、引用ビュー | `prioritizeActions()` + `getEDAReport()` | WSJF/RICE を小数点 2 桁で表示 |
| PII | チェックボックス、ポリシー選択、結果表示 | `piiScan()` / `applyPiiPolicy()` | `updated_at` を日付表示 |
| Leakage | フラグ一覧、除外/承認/リセットボタン | `leakageScan()` / `resolveLeakage()` | 選択が空の場合ボタン無効 |
| Recipes | 生成ファイル一覧、再現統計、引用ビュー | `emitRecipes()` + `getEDAReport()` | ±1% 乖離検出で警告バナー |
| Settings | プロバイダ状態、API Key 入力フォーム | `getLlmCredentialStatus()` / `setLlmCredentials()` | 保存後に再ロード |

---

## 6. データセット状態遷移（H を含む）

```mermaid
stateDiagram-v2
  [*] --> Uploaded : /api/datasets/upload
  Uploaded --> Profiled : /api/eda
  Profiled --> PiiScanned : /api/pii/scan
  PiiScanned --> PiiApplied : /api/pii/apply
  Profiled --> LeakageChecked : /api/leakage/scan
  LeakageChecked --> LeakageResolved : /api/leakage/resolve
  Profiled --> ChartsSuggested : /api/charts/suggest
  ChartsSuggested --> ChartGenerated : /api/charts/generate
  ChartsSuggested --> ChartsBatchGenerated : /api/charts/generate-batch
  Profiled --> QnAAnswered : /api/qna
  QnAAnswered --> ActionsPrioritized : /api/actions/prioritize
  ChartsSuggested --> RecipesEmitted : /api/recipes/emit
  ActionsPrioritized --> RecipesEmitted
  RecipesEmitted --> [*]
  note right of Profiled
    orchestrator が LLM 呼び出しに失敗した場合
    fallback_applied=true がメトリクスに記録され、
    UI は LLM フォールバック警告を表示する。
  end note
  note right of ChartsSuggested
    H: チャート生成
    単発は job_id で追跡しプレビュー表示。
    一括は batch_id で進捗管理（並列度=3）。
    失敗は個別に再試行しテンプレへフォールバック。
  end note
```

---

## 7. エラー / フォールバック表示

- **LLM フォールバック**: `references` に `tool:` で始まる参照が含まれる場合、EDA/Actions/Recipes ページで黄色の警告バナーを表示。
- **SLO 超過**: UI では即時表示しないが、`data/metrics/events.jsonl` に `duration_ms` が記録される。`python3 apps/api/scripts/check_slo.py` で検知。
- **PII/Leakage 未設定**: API が空配列を返した場合は「なし」と表示。
- **レシピ再現差分**: `measured_summary` の ±1% を超えた場合、赤い警告バナーを表示。
- **チャート生成（H）**:
  - LLM 空応答/JSON不整合/安全フィルタ: カード内に人間可読エラー（カテゴリ含む）を表示し、テンプレート生成に切替可。
  - 一括生成: 失敗は個別扱い。他カードは継続。再試行は最大3回で指数バックオフ。

---

## 8. 補足 (バックログ)

- Home に CSV アップロードモーダルを追加し、`POST /api/datasets/upload` と連携する UI を今後実装する。
- Storybook/Playwright VR を活用し、Charts（H）の代表チャートで Linux ベースラインに対する差分検知を行う。

現行実装に沿った図面を維持し、機能追加時は本ファイルを更新すること。
