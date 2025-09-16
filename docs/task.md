# 統合版 AutoEDA 実装計画書（Gemini × ChatGPT 統合）

---

## 1. 変更履歴

* v1.0 / 2025-09-15 / AutoEDA SA/Tech Lead / ChatGPT 版 初版（要件・設計・図・WF・SBに厳密準拠）。

---

## 2. 全体方針と前提

* スコープ：表形式データ（CSV 等）の **即時プロファイリング → 可視化提案 → 根拠付きQ\&A/次アクション → レシピ出力** を一気通貫で自動化（A1→A2→B1/B2→C1/C2→D1）。
* 非スコープ：インフラのプロビジョニング、基盤LLMの選定/運用、マーケ/獲得戦略。
* 対象ユーザー：DS/DE/PM（横断案件）。
* アーキ概念：Sources→ETL\&Profiling→Embeddings/VectorDB→Retriever/Reranker→EDA Agent（Tool Calls: profile\_api/chart\_api/stats\_api/pii\_scan）→LLM（構造化JSON）→Evaluator→Observability。
* 主要NFR（品質ゲート）：

  * A1 ≤10s（p95）、groundedness≥0.9、Hallucination\@5≤2%、応答≤50KB、可用性≥99.9%、LLMコスト≤1.0円/1K tok。
  * A2 ≤6s、**説明×統計の一致率≥0.95**、引用必須、コスト≤0.6円/1K tok、ストリーミング。
  * B1 ≤4s、**引用被覆率≥0.8**、数値＝ツール出力のみ、コスト≤0.5円/1K tok。
  * B2 ≤3s（prioritization 指標出力）。C1：PII再現率≥0.95/誤検知≤0.05。C2 ≤5s：既知リーク検出率≥0.9/誤警告≤0.1。D1 ≤8s：A1主要統計±1%再現、依存リスト同梱。
  * **LLM評価（共通）**：groundedness≥0.9、**引用被覆率≥0.8**、整合性スコア、Hallucination率@k（CI で自動評価）。
* 依存関係：OpenAI/LangChain/Chroma、ツール（profile\_api/chart\_api/stats\_api/pii\_scan）、FastAPI ルータ（eda/charts/pii/qna）、構造化ログ＋トレース標準化。

**Mappings:** REQ（A1/A2/B1/B2/C1/C2/D1）⇄ Route ⇄ WF ⇄ SB ⇄ API/イベント は各フェーズ表を参照。根拠は requirements/design/diagram/wireframe/storybook 参照ラベル一覧に整備済み。

---

## 3. フェーズ計画

### A1 即時プロファイリング（/eda/\:id）

**目的**：CSV（≤50列・≤100万行）から構造化 EDA レポート（`distributions`,`key_features`,`outliers`,`data_quality_report`,`next_actions`）を返す。数値はツール出力のみ採用。
**成果物**：上記 JSON（各セクションに根拠リンク/Reference 付与）。

**WBS（ID / 担当 / 依存 / 所要 / 根拠）**

* T-A1-05 / BE / イベント設計 / **2d** / 観測イベント `EDAReportGenerated` 発火と集計。
* T-A1-06 / BE / 失敗ハンドリング / **3d** / LLM失敗時フォールバック（ツール結果要約のみ、ラベル付）。
* T-A1-07 / QA / A1 NFR / **2d** / CI で p95/groundedness/引用被覆率の自動検証。

**UI/API トレーサビリティ**

| Route      | UI(WF)                          | SB コンポーネント                                                                               | API/イベント                              |   |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | - |
| `/eda/:id` | `[WF:C:sum-001]/[WF:C:qil-001]` | `SummaryCards(rows,cols,missingRate,typeMix)`, `QualityIssuesList(issues,onSelectIssue)` | `POST /api/eda`, `EDAReportGenerated` |   |

**品質ゲート（Exit/DoD）**：p95≤10s、groundedness≥0.9、Hallucination\@5≤2%、応答≤50KB、可用性≥99.9%、**引用被覆率≥0.8**。
**リスク&軽減策**：大規模データ遅延→サンプリング/列選択と再試行、幻覚→RAG必須＋JSON Schema検証＋引用強制。

**BDD（最小2本）**

```gherkin
Feature: A1 即時プロファイリングの完了
Scenario: CSVアップロード後に構造化レポートが返る
  Given CSV (<=50列, <=1,000,000行) を dataset_id として登録済み
  When POST /api/eda {dataset_id}
  Then 200で distributions/key_features/outliers/data_quality_report/next_actions を返す
   And 各セクションに Reference が付与されている
   And p95 レイテンシは 10 秒以下である
```



```gherkin
Feature: A1 サンプリングオプション動作
Scenario: 大容量CSVが初回タイムアウトし再試行
  Given sample オプションが有効
  When 再試行を実行する
  Then EDA レポートが返り、主要統計がフルデータと概ね一致する
```



**Mappings:** \[REQ-A1], \[HLD-EDA], \[DG\:route-eda], \[WF\:C\:sum-001],\[WF\:C\:qil-001], \[SB\:SummaryCards],\[SB\:QualityIssuesList]。

---

### A2 チャート自動提案（/charts/\:id）

**目的**：A1 結果から **上位5件** のチャート候補を生成。**説明×統計の一致率≥0.95** を満たすもののみ提示。
**成果物**：`charts[] (type, explanation, source_ref, consistency_score)`。

**WBS**

* T-A2-01 / BE / schemas / — / `POST /api/charts/suggest (k=5)` 実装＋一致 Evaluator。
* T-A2-02 / FE / A1完了 / — / `ChartGallery/ExplanationPanel/ConsistencyBadge` と採用/除外 UI。
* T-A2-03 / BE / Obs基盤 / — / 観測イベント `ChartsSuggested`（候補数・score）。

**UI/API トレーサビリティ**

| Route         | UI(WF)                                 | SB コンポーネント                                               | API/イベント                                      |   |
| ------------- | -------------------------------------- | -------------------------------------------------------- | --------------------------------------------- | - |
| `/charts/:id` | `ChartGallery(max 5)/ExplanationPanel` | `ChartCard(chart,onAdopt,onExclude)`, `ConsistencyBadge` | `POST /api/charts/suggest`, `ChartsSuggested` |   |

**品質ゲート**：p95≤6s、一致率≥0.95、`explanation` と `source_ref` 必須。

**BDD**

```gherkin
Feature: A2 チャート自動提案
Scenario: 上位5件の一貫したチャート候補を返す
  Given A1のプロファイル結果あり
  When POST /api/charts/suggest {dataset_id, k:5}
  Then charts[5] を返し explanation と source_ref を必須とする
   And 各候補の consistency_score は 0.95 以上
   And p95 は 6 秒以下
```



```gherkin
Feature: A2 不整合フィルタ
Scenario: 整合性の低いチャートは非表示
  Given filterConsistent = true
  When 一致率が閾値未満の候補が含まれる
  Then それらは UI に表示されない
```



**Mappings:** \[REQ-A2], \[DG\:route-charts], \[SB\:ChartCard]。

---

### B1 根拠付き Q\&A（/qna/\:id）

**目的**：自然言語質問に対し **stats\_api + RAG** の数値根拠で回答（**引用被覆率≥0.8**）。
**成果物**：`answers[] + references[]`（数値はツール出力と一致）。

**WBS**

* T-B1-01 / BE / RAG/Tool連携 / — / `POST /api/qna`（stats\_api + RAG パイプライン）。
* T-B1-03 / BE / Obs基盤 / — / 観測イベント `EDAQueryAnswered`。

**UI/API トレーサビリティ**

| Route      | UI(WF)                           | SB コンポーネント                                               | API/イベント                            |   |
| ---------- | -------------------------------- | -------------------------------------------------------- | ----------------------------------- | - |
| `/qna/:id` | `Q&A（Answer/Numbers/References）` | `QuestionBox(onAsk)`, `AnswerPane(references, coverage)` | `POST /api/qna`, `EDAQueryAnswered` |   |

**品質ゲート**：p95≤4s、引用被覆率≥0.8、数値＝ツール出力のみ（コスト≤0.5円/1K tok）。

**BDD**

```gherkin
Feature: B1 根拠付き回答
Scenario: 数値質問に対し引用付きで応答
  Given /qna/:id を開き質問を入力
  When POST /api/qna が stats_api と RAG を実行
  Then references を伴う回答を返し coverage >= 0.8
   And p95 は 4 秒以下
```

（NFR/受入れ基準に準拠）

**Mappings:** \[REQ-B1], \[SB\:QuestionBox/AnswerPane]。

---

### B2 次アクション優先度付け（/actions/\:id）

**目的**：`next_actions` に **impact/effort/confidence/score** を付与し優先度を提示。

**WBS**

* T-B2-01 / BE / 評価関数 / — / score 算出（WSJF/RICE 等は設計に準拠）。

**UI/API トレーサビリティ（要旨）**

| Route          | UI(WF)              | SB コンポーネント               | API/イベント                                             |   |
| -------------- | ------------------- | ------------------------ | ---------------------------------------------------- | - |
| `/actions/:id` | Prioritized Actions | `PrioritizedActionsList` | `POST /api/actions/prioritize`, `ActionsPrioritized` |   |

**品質ゲート**：p95≤3s、score 出力。

**BDD**

```gherkin
Feature: B2 優先度付け
Scenario: next_actions にスコアが付与される
  Given A1 の next_actions が存在
  When /api/actions/prioritize を実行
  Then 各アクションに impact/effort/confidence/score を付与し降順で返す
   And p95 は 3 秒以下
```

（NFRに準拠）

**Mappings:** \[REQ-B2], \[SB\:PrioritizedActionsList]。

---

### C1 PII スキャン & マスキング（/pii/\:id）

**目的**：正規表現＋辞書照合で PII を検出し、`MASK/HASH(SALTED)/DROP` ポリシで UI/ログ/API を保護。監査イベント必須。

**WBS**

* T-C1-01 / BE / 監査 / — / `PIIMasked` イベントに `detected_fields[]`, `mask_policy` を記録。

**UI/API トレーサビリティ（要旨）**

| Route      | UI(WF)     | SB コンポーネント                                 | API/イベント                          |   |
| ---------- | ---------- | ------------------------------------------ | --------------------------------- | - |
| `/pii/:id` | PII Policy | `DetectedFieldsTable`, `PIIPolicySelector` | `POST /api/pii/scan`, `PIIMasked` |   |

**品質ゲート**：PII 再現率≥0.95、誤検知≤0.05、監査イベント必須。

**BDD**

```gherkin
Feature: C1 PII 検出とマスキング
Scenario: メールと電話番号が検出・マスクされる
  Given PII を含む CSV を /api/pii/scan に送る
  When スキャンが実行される
  Then detected_fields に email, phone が含まれ policy に基づき MASK/HASH が適用される
   And PIIMasked 監査イベントが記録される
```



**Mappings:** \[REQ-C1], \[SB\:DetectedFieldsTable/PIIPolicySelector]。

---

### C2 リーク検査（/leakage/\:id）

**目的**：既知リークの検出率≥0.9、誤警告≤0.1、p95≤5s。軽量 LLM＆ルールで監査。

**WBS（要旨）**

* T-C2-01 / BE / ルール / — / 既知リークパターン検出＋軽量 LLM による二段確認。

**UI/API トレーサビリティ（要旨）**

| Route          | UI(WF)        | SB コンポーネント          | API/イベント                         |   |
| -------------- | ------------- | ------------------- | -------------------------------- | - |
| `/leakage/:id` | Leakage Flags | `LeakageFlagsPanel` | `POST /api/leakage/scan`, 監査イベント |   |

**BDD（例）**

```gherkin
Feature: C2 既知リーク検査
Scenario: 既知パターンのリークを検出
  Given リーク既知パターンを含むデータ
  When /api/leakage/scan を実行
  Then 検出率 >= 0.9 かつ false positive <= 0.1 として判定される
   And p95 は 5 秒以下
```

（NFR に準拠）

**Mappings:** \[REQ-C2], \[SB\:LeakageFlagsPanel]。

---

### D1 レシピ出力（/recipes/\:id）

**目的**：`recipe.json`, `eda.ipynb`, `sampling.sql` を生成。**A1主要統計±1%** で再現。p95≤8s、依存リスト同梱。

**UI/API トレーサビリティ（要旨）**

| Route          | UI(WF)    | SB コンポーネント      | API/イベント                                        |   |
| -------------- | --------- | --------------- | ----------------------------------------------- | - |
| `/recipes/:id` | Artifacts | `ArtifactsList` | `POST /api/recipes/export`, `ArtifactsExported` |   |

**BDD**

```gherkin
Feature: D1 レシピの再現性
Scenario: 主要統計が±1%で再現される
  Given A1 の distributions/key_features が存在
  When /api/recipes/export を実行
  Then eda.ipynb と sampling.sql が出力され A1 主要統計が ±1% で一致する
   And p95 は 8 秒以下
```

（NFR に準拠）

**Mappings:** \[REQ-D1], \[SB\:ArtifactsList]。

---

## 4. アーキテクチャ

* 技術スタック（FE）：**Next.js（App Router）/ Zustand / React Query / shadcn/ui / Tailwind**。
* 技術スタック（BE）：**FastAPI**、ルータ分割（eda/charts/pii/qna）、OpenTelemetry 計測。
* LLM/RAG/ツール：OpenAI Adapter + LangChain + **Chroma（VectorDB）**、`profile_api/chart_api/stats_api/pii_scan` を関数呼び出しで連携。
* 構造化出力：JSON Schema で各セクション必須化（`distributions[]` 等）。
* 観測：構造化ログ、p95/p99、groundedness/引用被覆率、トレース標準化。

---

## 5. 観測可能性・評価（イベント / メトリクス / ダッシュボード）

* 主要イベント

  * `EDAReportGenerated {duration_ms, groundedness, tokens_used, sample_ratio...}`（retention 90d）。
  * `ChartsSuggested {duration_ms, k, consistency_score[]}`。
  * `EDAQueryAnswered {question, references, duration_ms}`。
* LLM 自動評価：**groundedness≥0.9、引用被覆率≥0.8、整合性スコア、Hallucination率@k**。ゴールデンテスト/プロンプト回帰を CI 組込。
* ダッシュボード：各イベントの p95, 合格率（整合/被覆）を日次/週次で可視化。

---

## 6. セキュリティ/プライバシー（PII/リーク検査/ガードレール）

* PII 検出：**正規表現＋辞書**、ポリシ：`MASK/HASH(SALTED)/DROP`、監査イベント `PIIMasked` 記録。
* ガードレール：タイムアウト/指数バックオフ、フォールバック（**ツール結果のみの簡易要約**を明示ラベルで返却）、出力サイズ上限、JSON Schema 検証、機密語リスト。
* セキュリティ要求（要件）：Prompt Injection フィルタ、権限ベースアクセス、RAG 既知リスト監査、品質測定の継続。

---

## 7. 決定と根拠（衝突解決の理由）

* **A2 候補数/しきい値**：Gemini/ChatGPT 間差分なしだが、要件の **上位5件** と **一致率≥0.95 / p95≤6s** を統一採用（**厳しい値優先**）。
* **LLM 評価しきい値**：両計画書とも **groundedness≥0.9 / 引用被覆率≥0.8**。設計の自動評価指針を正として統合。
* **フォールバック方針**：Gemini 記載の「**ツール結果のみ**を返却」を採択（UIに警告ラベルを明示）。
* **観測/計測方法**：EDA の p95 計測区間（ApiRequestStart→EDAReportGenerated）と ChartsSuggested の duration\_ms 集計を採用。
* **数値の扱い**：要件・設計・WF・SB に記載の値のみ採用（**推測値禁止**）。

---

## 8. 付録（スキーマ/JSON例/用語）

### 8.1 代表 JSON スキーマ断片

* `EDAReport`（必須）：`distributions[]`, `key_features[]`, `outliers[]`, `data_quality_report`, `next_actions[]`。
* `ChartSuggestion`: `{type, explanation, source_ref, consistency_score}`。

### 8.2 画面ワイヤーフレームの要点

* A2 画面：**max 5** のグリッド、`[show only consistent]`、各カードに `consistency 0.97` 等を表示し Adopt/Exclude 操作。

### 8.3 用語

* groundedness / 引用被覆率 / WSJF / RICE / PII ほか（本体参照）。

---

### （整合性検査の記述）

* ルーティング `/eda|/charts|/qna|/actions|/pii|/leakage|/recipes` は diagram/WF/SB の対応が取れている（A1/A2/B1/B2/C1/C2/D1 の各表参照）。A2 の **k=5**、B1 の **coverage≥0.8**、D1 の **±1%** は UI/イベント・API 契約・NFR が相互に矛盾しない。

---

## 付記：品質ゲートとフォールバック（横断）

* すべてのフェーズで **p95 レイテンシ**・**groundedness**・**引用被覆率**を **イベントベースで監査**し、失敗時は **ツール値の簡易要約にフォールバック**。

---

### 参照マッピング（抜粋）

* \[REQ-A1] 要件（CSV 制約、NFR、イベント名）／\[REQ-A2] 上位5・0.95・6s／\[REQ-B1] 0.8・4s／\[REQ-D1] ±1%・8s。
* \[HLD-EDA] 設計（NFR 表、LLM 評価、テスト戦略）。
* \[DG\:route-eda/charts] ルーティング。
* \[WF/SB] 各コンポーネント Props/Events と画面断面。

