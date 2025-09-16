# AutoEDA（プロトタイピング版）画面遷移図

> `requirements.md` の設計方針に合わせ、**A1〜D1**の主要フローをページ（四角）／モーダル（丸角）／分岐（ひし形）で記載。
> ルーティングは \*\*/（Next.js 互換）\*\*の想定ですが、Vite でも同等に実装可能です。

---

## 1) サイトマップ（全体俯瞰）

```mermaid
flowchart LR
  subgraph Global Navigation
    L[Login/Setup（任意）]:::muted
    H[/Home: / /]
    D[/Datasets: /datasets/]
    E[/EDA: /eda/:dataset_id/]
    C[/Charts: /charts/:dataset_id/]
    Q[/Q&A: /qna/:dataset_id/]
    N[/Next Actions: /actions/:dataset_id/]
    P[/PII: /pii/:dataset_id/]
    K[/Leakage: /leakage/:dataset_id/]
    R[/Recipes: /recipes/:dataset_id/]
    G[/Settings: /settings/]
  end

  H --> D
  D --> E
  E --> C
  E --> Q
  Q --> N
  E --> P
  E --> K
  E --> R
  C --> R
  N --> R

  classDef muted fill:#f7f7f7,stroke:#ddd,color:#999;
```

---

## 2) メインフロー（A1→A2→B1/B2→D1）

```mermaid
flowchart TD
  U[ユーザー] --> H[/Home<br/>アップロード&最近のデータ/]
  H -->|CSV選択| UPL([Upload Modal])
  UPL -->|成功| D[/Datasets 一覧/]
  D -->|EDA開始| E[/EDA 概要レポート/]

  subgraph A1: プロファイリング
    E --> A1{プロファイル実行?}
    A1 -->|OK| EOK[構造化JSON表示<br/>distributions/key_features/outliers<br/>data_quality_report/next_actions]
    A1 -->|失敗| EERR([再試行/サンプル実行ダイアログ])
  end

  EOK -->|可視化を自動提案| C[/Charts 候補/]

  subgraph A2: チャート自動提案
    C --> A2{整合性検査OK?}
    A2 -->|OK| COK[explanation + source_ref 付きで表示]
    A2 -->|NG| CFILT([不整合チャートを非表示/警告])
  end

  COK -->|質問する| Q[/Q&A/]

  subgraph B1/B2: Q&A と次アクション
    Q --> B1{stats_api実行/引用>=0.8?}
    B1 -->|OK| QOK[根拠リンク付き回答]
    B1 -->|不足| QREF([追加検索→再生成])
    QOK -->|次に何をすべき?| N[/Next Actions/]
    N --> B2{優先度付け<br/>WSJF/RICE}
    B2 --> NOK[impact/effort/confidence/score 表示]
  end

  NOK -->|再現レシピを出力| R[/Recipes/]

  subgraph D1: レシピ出力
    R --> D1{生成成功?}
    D1 -->|OK| ROK[recipe.json / eda.ipynb / sampling.sql<br/>artifact_hash / ダウンロード]
    D1 -->|NG| RERR([ログ参照&再生成])
  end
```

---

## 3) 品質/セキュリティ補助フロー（C1/C2）

```mermaid
flowchart LR
  E[/EDA 概要レポート/] --> P[/PII 検出/]
  P --> C1{PII 検出?}
  C1 -->|Yes| PM([マスク適用 Modal<br/>MASK/HASH/DROP 選択肢]) --> POK[マスク済みで再計算] --> E
  C1 -->|No| E

  E --> K[/Leakage 検査/]
  K --> C2{未来情報/集計後列/派生列の疑い?}
  C2 -->|Yes| KFLAG([flagged_columns + rules_matched を表示<br/>影響説明/除外オプション]) --> E
  C2 -->|No| E
```

---

## 4) 画面別 UI 要素（主要コンポーネント／遷移）

| 画面(Route)                         | 主要UI/コンポーネント                                                                                     | 主要操作                                 | 遷移先                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------- |
| **Home** (`/`)                    | DatasetUploader, RecentDatasets, KPI バッジ                                                         | CSV 選択 / アップロード                      | `/datasets/`                                                          |
| **Datasets** (`/datasets/`)       | DatasetTable（rows/cols/更新日時）, NewEDA ボタン                                                         | 「EDAを開始」                             | `/eda/:dataset_id/`                                                   |
| **EDA 概要** (`/eda/:id`)           | SummaryCards（distributions/key\_features/outliers）, QualityIssuesList（重大度/根拠）、NextActionsPreview | 「可視化を自動提案」「Q\&A」「PII/Leakage」「レシピ出力」 | `/charts/:id`, `/qna/:id`, `/pii/:id`, `/leakage/:id`, `/recipes/:id` |
| **Charts 候補** (`/charts/:id`)     | ChartGallery(最大5), ExplanationPanel, ConsistencyBadge                                            | 採用/除外、ソース参照                          | `/recipes/:id` or 戻る                                                  |
| **Q\&A** (`/qna/:id`)             | QuestionBox, AnswerPane（引用タブ・統計タブ）, Followups                                                    | 送信/再検索                               | `/actions/:id`                                                        |
| **Next Actions** (`/actions/:id`) | PrioritizedList（impact/effort/confidence/score）, フィルタ/並び替え                                       | 採択/エクスポート                            | `/recipes/:id`                                                        |
| **PII** (`/pii/:id`)              | DetectedFieldsTable, MaskPolicySelector                                                          | 適用/差戻し                               | `/eda/:id`                                                            |
| **Leakage** (`/leakage/:id`)      | FlaggedColumns, RulesMatched, 影響説明                                                               | 除外/承認                                | `/eda/:id`                                                            |
| **Recipes** (`/recipes/:id`)      | ArtifactsList（`recipe.json`/`eda.ipynb`/`sampling.sql`）, Hash/Version                            | ダウンロード                               | 終了                                                                    |

---

## 5) 画面状態（State Machine：データセット単位）

```mermaid
stateDiagram-v2
  [*] --> Uploaded
  Uploaded --> Profiled: profile_api 完了
  Profiled --> PIIScanned: pii_scan 完了
  PIIScanned --> Masked: マスク適用
  Masked --> EDAReady: LLM要約（構造化JSON）
  EDAReady --> ChartsSuggested: chart_api + 整合性OK
  EDAReady --> QnAAnswered: stats_api + RAG + 引用>=0.8
  QnAAnswered --> ActionsPrioritized: WSJF/RICE スコア付与
  ChartsSuggested --> RecipesEmitted
  ActionsPrioritized --> RecipesEmitted
  RecipesEmitted --> [*]
  note right of EDAReady
    すべての数値はツール出力のみ採用
    groundedness>=0.9 / 引用被覆率>=0.8
  end note
```

---

## 6) エラー/フォールバック遷移（共通）

```mermaid
flowchart TD
  any[任意画面] --> TMO{タイムアウト?}
  TMO -->|Yes| RETRY([再試行ボタン/指数バックオフ])
  TMO -->|No| CONT[処理継続]

  any --> VAL{入力/スキーマ不正?}
  VAL -->|Yes| FORMERR([入力エラー表示/修正促し])

  any --> LLMERR{LLM失敗?}
  LLMERR -->|Yes| FB([フォールバック: ツール結果の簡易要約のみ表示<br/>※明示ラベル付き])
```

---

## 7) ルーティング設計（Next.js 例）

```
app/
├─ page.tsx                      # Home
├─ datasets/page.tsx             # Datasets
├─ eda/[dataset_id]/page.tsx     # EDA 概要
├─ charts/[dataset_id]/page.tsx  # Charts 候補
├─ qna/[dataset_id]/page.tsx     # Q&A
├─ actions/[dataset_id]/page.tsx # Next Actions
├─ pii/[dataset_id]/page.tsx     # PII
├─ leakage/[dataset_id]/page.tsx # Leakage
└─ recipes/[dataset_id]/page.tsx # Recipes
```

---

## 8) 画面遷移チェックリスト（受け入れ要件トレース）

* A1: `/eda/:id` 到達時に **構造化JSON** の全セクションが表示される（根拠リンク付）。
* A2: `/charts/:id` で **不整合チャートは非表示**、説明に `source_ref` 必須。
* B1: `/qna/:id` の回答中、**数値はツール出力のみ**・**引用被覆率≥0.8**。
* B2: `/actions/:id` の各アクションに **impact/effort/confidence/score**。
* C1: `/pii/:id` で **検出→マスク→再計算** の往復が画面遷移で成立。
* C2: `/leakage/:id` で **flagged\_columns** と **rules\_matched** の確認→承認/除外。
* D1: `/recipes/:id` で **3成果物** のダウンロードが可能、**artifact\_hash** 表示。

---

### 備考（プロトタイプ向けUI実装ヒント）

* **非同期状態の可視化**：各ページに `LoadingBar` / `Toast` / `Retry` を標準実装。
* **根拠の開示**：Explanation セクションは常に **「数値タブ」「引用タブ」** を持つ。
* **スモールステップ**：A1 完了後に順次ボタンを活性化（A2/Q\&A/NextActions/Recipes）。
* **アクセシビリティ**：表は見出しセル＋行キー、キーボード操作（←→でタブ切替）。
