# AutoEDA ワイヤーフレーム v1（プロトタイピング版）

> 対象: ローカル実行の個人開発向け MVP / Web UI + REST API。HLD(設計文書)の A1〜D1 シナリオと NFR を満たす画面の**低忠実度(Lo‑Fi)ワイヤーフレーム**です。
> 記法: \[C] コンポーネントID, \[A] 操作, \[S] 状態/バッジ, \[R] 参照(引用/根拠), \[E] エラー/フォールバック。

---

## 0. 共通 UI 要素 (全画面)

```
┌──────────────────────────────────────────────────────────────┐
│ AutoEDA ▸ Dataset: <name>  [Search]                [Help] [⚙] │  ← グローバルヘッダ [C:hdr]
├──────────────────────────────────────────────────────────────┤
│ Breadcrumbs  | ToastArea [S] | ProgressBar [S]                │  ← 通知/進捗 [C:toast][C:progress]
└──────────────────────────────────────────────────────────────┘
```

* ショートカット: ⌘K=コマンドパレット、/ = 検索、? = ヘルプ。
* テーマ: ライト/ダーク切替(任意)。

---

## 1. Home / (アップロード & 最近のデータ)

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] Welcome to AutoEDA                                        │
├──────────────────────────────────────────────────────────────┤
│ [C:upl-001] Upload Panel                                       │
│  ┌───────────────────────────────┐   ┌─────────────────────┐  │
│  │  Drop CSV here / Select File  │   │  [A] Start EDA      │  │
│  └───────────────────────────────┘   └─────────────────────┘  │
│  • Accept: .csv  • Max: 50 cols / 1M rows  • Sample: on/off     │
├──────────────────────────────────────────────────────────────┤
│ [C:rec-001] Recent Datasets                                     │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ Name        Rows  Cols  UpdatedAt      [A] Open [A] EDA   │   │
│  │ sales.csv   1M    48    2025-09-12     [Open] [EDA]      │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

* 遷移: \[A] Start EDA → `/datasets/` → `/eda/:dataset_id`
* API: `POST /api/datasets/upload` -> dataset\_id 返却。

---

## 2. Datasets /datasets

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] Datasets                                                 │
├──────────────────────────────────────────────────────────────┤
│ [C:tbl-001] Table: Name | Rows | Cols | Updated | Actions      │
│  ... [A] Open  [A] EDA                                      │
└──────────────────────────────────────────────────────────────┘
```

* 遷移: \[A] EDA → `/eda/:dataset_id`

---

## 3. EDA 概要 /eda/\:dataset\_id  — A1

```
┌──────────────────────────────────────────────────────────────────────┐
│ [H1] EDA Summary — <dataset>                                         │
├───────────────────┬──────────────────────────────────────────────────┤
│ [C:sum-001] Cards │ [C:qil-001] Quality Issues (severity, desc, R)   │
│  • Rows/Cols      │  ┌─────────────────────────────────────────────┐ │
│  • Missing%       │  │ [S] critical  col=price  desc=... [R:id...] │ │
│  • Types mix      │  │ [S] high      col=date   desc=... [R:id...] │ │
│  ──────────────── │  └─────────────────────────────────────────────┘ │
│ [C:dis-001] Distributions (per column, mini‑hist)                     │
│ [C:key-001] Key Features (bullets)                                     │
│ [C:out-001] Outliers (table: col | count | [A] View)                   │
├───────────────────┴──────────────────────────────────────────────────┤
│ [A] 可視化を自動提案 → /charts/:id   [A] Q&A → /qna/:id               │
│ [A] PII 検出 → /pii/:id             [A] リーク検査 → /leakage/:id      │
│ [A] レシピ出力 → /recipes/:id                                            │
└──────────────────────────────────────────────────────────────────────┘
```

* NFR 表示: p95≤10s, groundedness≥0.9, 引用被覆率≥0.8 (画面右上にバッジ)
* API: `POST /api/eda` → `distributions,key_features,outliers,data_quality_report,next_actions, references`

---

## 4. チャート候補 /charts/\:dataset\_id — A2

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [H1] Chart Suggestions                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Filter: [show only consistent] [k=5]                                   │
│ Grid (max 5):                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  [Chart#1]   │  │  [Chart#2]   │  │  [Chart#3]   │  ...            │
│  │ [R:id...]    │  │ [R:id...]    │  │ [R:id...]    │                 │
│  │ expl: ...    │  │ expl: ...    │  │ expl: ...    │                 │
│  │ [S] ✅ consistency 0.97         │  │ [S] ⚠ 0.82 (hidden if off)     │
│  │ [A] Adopt  [A] Exclude          │  │ [A] Adopt  [A] Exclude         │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
├─────────────────────────────────────────────────────────────────────────┤
│ [A] 質問する → /qna/:id      [A] レシピへ進む → /recipes/:id             │
└─────────────────────────────────────────────────────────────────────────┘
```

* API: `POST /api/charts/suggest` (k=5)。整合性検査は Evaluator 内部。
* NFR: 説明×統計一致率≥0.95, p95≤6s。

---

## 5. Q\&A /qna/\:dataset\_id — B1/B2

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] Q&A                                                     │
├──────────────────────────────────────────────────────────────┤
│ [C:qbx-001] QuestionBox: "売上に効く上位要因は?" [A] Ask        │
│ [Tabs] Answer | Numbers | References                           │
│  • Answer: テキスト(根拠にインライン引用マーカー) [R]            │
│  • Numbers: stats_api 出力 (相関/重要度/CI等)                    │
│  • References: RAG 文書/チャート/セル/クエリID                    │
│ [S] 引用被覆率 ≥0.8 | groundedness ≥0.9                         │
├──────────────────────────────────────────────────────────────┤
│ [A] 次アクションを提案 → /actions/:id                           │
└──────────────────────────────────────────────────────────────┘
```

* API: `POST /api/qna` (内部で `stats_api` + RAG)。
* B2 遷移で `next_actions[]` を優先度付き表示。

---

## 6. 次アクション /actions/\:dataset\_id — B2

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] Next Actions (Prioritized)                              │
├──────────────────────────────────────────────────────────────┤
│ Sort by: [score]  Filter: [impact≥0.5] [effort≤0.5]          │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ ✓ | Title                    | Impact | Effort | Conf |Score│
│ │──┼───────────────────────────┼────────┼───────┼──────┼─────│
│ │   追加データ:天候API         | 0.7    | 0.3   | 0.8  | 0.62│
│ │   前処理:カテゴリ統合        | 0.5    | 0.2   | 0.9  | 0.59│
│ └─────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│ [A] Export to recipe → /recipes/:id                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. PII 検出 /pii/\:dataset\_id — C1

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] PII Scan                                                │
├──────────────────────────────────────────────────────────────┤
│ Detected Fields:                                             │
│  email (col=email)  phone (col=tel) ...                      │
│ [C:mask-001] Policy: [MASK | HASH(SALTED) | DROP]            │
│ [A] Apply & Recalculate                                      │
└──────────────────────────────────────────────────────────────┘
```

* イベント: `PIIMasked` (detected\_fields, mask\_policy, pii\_flag=true)

---

## 8. リーク検査 /leakage/\:dataset\_id — C2

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] Leakage Check                                           │
├──────────────────────────────────────────────────────────────┤
│ Flagged Columns:                                             │
│  target_mean_by_user  created_after_label  ...               │
│ Rules Matched: time_causality, aggregation_trace             │
│ [A] Exclude from modeling  [A] Accept risk                   │
└──────────────────────────────────────────────────────────────┘
```

* イベント: `LeakageRiskFlagged` (flagged\_columns, rules\_matched)

---

## 9. レシピ出力 /recipes/\:dataset\_id — D1

```
┌──────────────────────────────────────────────────────────────┐
│ [H1] Reproducible Artifacts                                  │
├──────────────────────────────────────────────────────────────┤
│ Files                                                        │
│  • recipe.json     [A] Download                              │
│  • eda.ipynb       [A] Download                              │
│  • sampling.sql    [A] Download                              │
│ Hash: <artifact_hash>  Version: v1                           │
│ [A] Regenerate (同条件)  [A] Open in notebook (任意)           │
└──────────────────────────────────────────────────────────────┘
```

* NFR: A1主要統計±1%以内で再現、依存リスト同梱。

---

## 10. モーダル/ダイアログ/トースト

```
[Upload Modal]
┌────────────────────────────┐
│ Select CSV [Browse]        │
│ [A] Upload  [A] Cancel     │
└────────────────────────────┘

[Retry Dialog]
┌────────────────────────────┐
│ 処理がタイムアウトしました。     │
│ [A] Retry (backoff)         │
│ [A] Use sample (1%)         │
└────────────────────────────┘

[Mask Policy Modal]
┌────────────────────────────┐
│ PII 方針を選択: MASK/HASH/DROP │
│ [A] Apply                   │
└────────────────────────────┘

[Toast]
✓ EDAReportGenerated (8.4s, groundedness 0.92)
```

---

## 11. レスポンシブ（主要画面のモバイル版）

### 11.1 Home (mobile)

```
┌AutoEDA┐
│Upload │
│[Start]│
│Recent │
└───────┘
```

### 11.2 EDA 概要 (mobile)

```
┌EDA Summary┐
│Cards      │
│Issues     │
│Distributions
│KeyFeatures│
│Outliers   |
│[Charts] [Q&A]
│[PII] [Leak] [Recipe]
└───────────┘
```

### 11.3 Charts (mobile)

```
┌Charts┐
│[Card#1]
│ expl + [R]
│ [Adopt]
│────────
│[Card#2] ...
└───────┘
```

---

## 12. 画面→API/イベント マッピング

| 画面      | 主API                      | 主要イベント              |
| ------- | ------------------------- | ------------------- |
| Home    | POST /api/datasets/upload | —                   |
| EDA     | POST /api/eda             | EDAReportGenerated  |
| Charts  | POST /api/charts/suggest  | ChartsSuggested     |
| Q\&A    | POST /api/qna (stats+RAG) | EDAQueryAnswered    |
| Actions | — (内部: prioritize)        | NextActionsProposed |
| PII     | POST /api/pii/scan        | PIIMasked           |
| Leakage | POST /api/leakage/check   | LeakageRiskFlagged  |
| Recipes | POST /api/recipes/export  | EDARecipeEmitted    |

---

## 13. 受け入れ基準トレース (A1〜D1 抜粋)

* **A1**: EDA 概要に `distributions,key_features,outliers,data_quality_report,next_actions` が**常に表示**。\[R] 参照リンク必須。p95≤10s バッジ表示。
* **A2**: Charts 画面で不整合カードは**非表示**(フィルタON)。各カードに `explanation + source_ref + consistency`。
* **B1**: Q\&A で数値は `stats_api` 出力のみ。`References` タブの引用被覆率≥0.8 を計測/表示。
* **B2**: Actions で `impact/effort/confidence/score` を列として表示、並び替え/フィルタ可能。
* **C1**: PII 画面で検出→方針適用→再計算の操作が 1 画面内で完結。
* **C2**: Leakage で `flagged_columns, rules_matched` を説明付きで表示し、除外操作が可能。
* **D1**: Recipes で 3成果物の DL と `artifact_hash` 表示、Regenerate 操作。

---

## 14. 実装ヒント（UI スケルトン & 状態）

* **ローディング**: Cards/表/ギャラリーにスケルトン (骨組み) プレースホルダ。
* **エラー**: 上部バナー + 各カード内の再試行ボタン。
* **差分配信**: Charts/Q\&A はレスポンスストリーミングで段階的表示可。
* **アクセシビリティ**: 見出し階層、表ヘッダ、ボタンのラベル、Tab/Enter 操作。

---

## 15. コンポーネントID 一覧 (抜粋)

* `hdr` ヘッダ, `toast` トースト, `progress` 進捗バー
* `upl-001` アップロードパネル, `rec-001` 最近データ
* `sum-001` サマリーカード群, `qil-001` 品質問題リスト
* `dis-001` 分布一覧, `key-001` 主要特徴, `out-001` 外れ値
* `cgal-001` チャートギャラリー, `exp-001` 説明パネル
* `qbx-001` 質問ボックス, `ans-001` 回答ペイン
* `pri-001` 優先度付きリスト, `mask-001` マスクポリシ
