## アプリ/ツール案（LLM活用）— **AutoEDAアシスタント**

* **名前**: AutoEDAアシスタント
* **ターゲットユーザー**: DS/DE/PM（飲食・小売・通信の案件横断）
* **コア課題 / JTBD**: 「アップロード or 接続したデータを即座に品質診断・可視化し、次アクション（特徴量/仮説/追加データ要望）まで一気通貫で提案したい」
* **LLM設計（RAG/エージェント/関数呼び出し/構造化出力）**:

  * *RAG*: 社内データ辞書・ドメイン規約・可視化スタイルガイドをベクトルDB化し、要約や説明の根拠付けに利用
  * *エージェント*: 「プロファイリング→可視化→診断→提案」のサブルーチンをツール呼び出しで連携（`profile_api`, `chart_api`, `stats_api`, `pii_scan`）
  * *構造化出力*: JSON Schemaで `distributions[]`, `key_features[]`, `outliers[]`, `data_quality_report`, `next_actions[]` を必須化
  * *プロンプト方針*: System/Developer/Userの分層。数値はツール結果のみ採用、LLMの推測は禁止。
  * *キャッシュ/再ランク*: データ辞書Q\&Aは結果を短期キャッシュ、根拠文書は再ランクでTop-k選出
* **差別化キーフィーチャ（例）**:

  1. 反証探索CoT（矛盾チェック指示）、2) ソース自動引用（図表/セル範囲/クエリID）、3) セマンティック監査（説明と統計値の整合判定）、4) 期待値テスト（しきい値逸脱を警告）、5) PII/リーク検査、6) チャート自動推奨（目的×データ型で選択）
* **品質向上メカニズム**: ツール実行結果→LLM要約→検証器（ルール&軽量LLM）→再質問（不足根拠を検索）の4段ループ。Groundedness/引用被覆率/ハルシネーション率@kを継続測定。
* **セキュリティ/プライバシー/ガードレール**: Prompt Injectionフィルタ、PIIマスキング（列推定＋辞書）、権限ベースのデータアクセス、出力ポリシーチェック（機密語リスト）
* **KPI**（先行/遅行）: 先行= groundedness≥0.9、引用被覆率≥0.8、一次解決率↑ / 遅行= EDA工数▲50%・着手〜一次仮説提示LT▲40%・案件粗利%↑・SLA遵守
* **参考アーキテクチャ（Text図）**:

  ```
  Sources(DB/CSV/BI/Docs)
        └─ ETL & Profiling (stats_api, pii_scan)
             └─ Chunking/Embeddings → VectorDB
                  └─ Retriever + Reranker
                       └─ Orchestrator(EDA Agent)
                            ├─ Policy/Safety
                            ├─ Tool Calls: profile_api | chart_api | sql_sampler
                            └─ LLM (structured JSON)
                                   └─ Evaluator(groundedness/consistency)
                                        └─ Observability(Log/metrics/traces)
  ```
* **Build vs Buy・主要リスクと軽減策**:

  * *Build*: 既存OSS（pandas-profiling系/統計API）とRAG基盤を統合。高いカスタマイズ性。
  * *Buy*: BI/ETL製品にLLM機能を付与。導入は速いがドメイン適合が限定的。
  * *リスク*: 大規模データ時のレイテンシ/コスト、LLMの過大一般化、PII取り扱い。→ サンプリング＋前段要約、関数結果のみ採用、厳格なPIIポリシー・監査で軽減。

---

## ユーザーストーリー（LLM前提）— **Epic: AutoEDAでデータ探索と品質診断を自動化**

### Capability A: **データ概要レポート生成**

**Story A1: CSVアップロードからの即時プロファイリング**

* **Given** ユーザーがCSV（≤50列・≤100万行）をアップロードし「EDA開始」を選ぶ
* **When** システムが `profile_api` と `pii_scan` を実行し、結果をLLMに渡す
* **Then** `distributions`, `key_features`, `outliers`, `data_quality_report`, `next_actions` を含むJSONを返す（各セクションは根拠リンク付き）
* **受け入れ基準**:

  * p95レイテンシ≤10s（サンプリング許可時）
  * `data_quality_report.issues[]` に重大度・根拠（列名/統計）必須
  * groundedness≥0.9、ハルシネーション率@5≤2%
* **KPI**: 初回レポート一次合格率、EDA工数削減率、引用被覆率
* **LLM非機能**: 予算≤1.0円/1K tokens、可用性≥99.9%、応答最大50KB、モデル切替（高精度↔軽量）
* **Observabilityイベント**:

  * `event_name`: `EDAReportGenerated`
  * `properties`: `{user_id, dataset_id, rows, cols, sample_ratio, model_id, tokens_used, duration_ms, groundedness}`
  * `pii_flag`: true（内部で検知→結果はマスク）
  * `retention`: 90d
  * `prompt_hash`: `eda_v1_a1`
  * `tool_calls`: `[{"name":"profile_api","success":true},{"name":"pii_scan","success":true}]`

**Story A2: チャート自動生成と説明文の整合性検査**

* **Given** A1の結果があり、ユーザーが「可視化を自動提案」を実行
* **When** システムが `chart_api` で候補チャート（上位5件）を作成し、LLMが各チャートの説明文を生成
* **Then** 説明文に使用統計と図表IDの引用を付与し、整合性検査を通過したもののみ返す
* **受け入れ基準**: 説明と統計の一致率≥0.95、p95レイテンシ≤6s、JSONに `charts[i].explanation` と `source_ref` 必須
* **KPI**: 採用チャート率、誤説明検出率（内部監査器の検知）
* **LLM非機能**: 0.6円/1K tokens上限、レスポンス差分配信（ストリーミング）
* **Observability**:

  * `event_name`: `ChartsSuggested`
  * `properties`: `{dataset_id, chart_count, model_id, tokens_used, consistency_score}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_a2`
  * `tool_calls`: `[{"name":"chart_api","count":5}]`

---

### Capability B: **インタラクティブQ\&Aと仮説提案**

**Story B1: 影響要因の自然言語質問に対する根拠付き回答**

* **Given** ユーザーが「売上に効く上位要因は？」と質問
* **When** システムが相関/重要度統計を `stats_api` で算出し、RAGでドメイン規約を参照
* **Then** LLMが「上位要因・推定効果・注意点」をJSONで返し、すべてに統計根拠リンクを付与
* **受け入れ基準**: 回答中の数値はツール出力に一致、引用被覆率≥0.8、p95≤4s
* **KPI**: 一時解決率、追質問の解消率、groundedness
* **LLM非機能**: 0.5円/1K tokens上限、セッション要約で履歴トークン圧縮
* **Observability**:

  * `event_name`: `EDAQueryAnswered`
  * `properties`: `{question, model_id, tokens_used, references, duration_ms}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_b1`
  * `tool_calls`: `[{"name":"stats_api","success":true},{"name":"vector_search","k":6}]`

**Story B2: 次アクション（仮説・追加データ要求・前処理提案）の提示**

* **Given** B1の結果を受け、ユーザーが「次に何をすべきか？」と要求
* **When** システムが品質課題・ビジネス目的・可用データを照合
* **Then** 「追加データ要望」「前処理レシピ」「検証実験案（AB/オフライン）」を優先度付きでJSON返却
* **受け入れ基準**: `next_actions[]` に *impact*・*effort*・*confidence* を数値で付与、WSJF/RICEのスコア提示
* **KPI**: 次アクション採択率、着手までのLT短縮
* **LLM非機能**: p95≤3s、0.3円/1K tokens上限
* **Observability**:

  * `event_name`: `NextActionsProposed`
  * `properties`: `{action_count, prioritized_by, model_id, tokens_used}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_b2`
  * `tool_calls`: `[]`

---

### Capability C: **データ品質・PII・リーク検査**

**Story C1: PII自動検出とマスキング**

* **Given** アップロードデータに氏名/電話/メール等が含まれる可能性
* **When** `pii_scan` が列型推定＋辞書照合を実行し、LLMが説明を要約
* **Then** マスク方針（表示/保存/送信）を自動適用し、結果を監査ログに記録
* **受け入れ基準**: PII検知再現率≥0.95、誤検知率≤0.05、監査イベント必須
* **KPI**: PII漏えい率→0、監査指摘件数↓
* **LLM非機能**: 安全ポリシー強制（機密語禁止）、レスポンスにPIIを含まないこと
* **Observability**:

  * `event_name`: `PIIMasked`
  * `properties`: `{dataset_id, detected_fields, mask_policy, model_id}`
  * `pii_flag`: true
  * `retention`: 180d
  * `prompt_hash`: `eda_v1_c1`
  * `tool_calls`: `[{"name":"pii_scan","success":true}]`

**Story C2: データリークリスク（ターゲット漏洩）検査**

* **Given** 教師ありタスク用のEDAで、目的変数と説明変数の関係を点検
* **When** システムが「未来情報/集計後列/リーク疑い列」をルール＆軽量LLMでスクリーニング
* **Then** リスク列をフラグし、根拠（生成ロジック/タイムスタンプ関係）を提示
* **受け入れ基準**: 既知リーク疑似データでの検出率≥0.9、誤警告≤0.1
* **KPI**: 後工程の再学習率↓、本番ドリフト低減
* **LLM非機能**: p95≤5s
* **Observability**:

  * `event_name`: `LeakageRiskFlagged`
  * `properties`: `{dataset_id, flagged_columns, rules_matched, model_id}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_c2`
  * `tool_calls`: `[{"name":"stats_api","checks":["time_causality","aggregation_trace"]}]`

---

### Capability D: **再現可能なEDAレシピ出力**

**Story D1: ノートブック/SQL/ワークフローの自動生成**

* **Given** A1〜C2の結果が確定
* **When** ユーザーが「再現レシピを出力」を選択
* **Then** `recipe.json`（手順/パラメータ）、`eda.ipynb`、`sampling.sql` を生成し、すべてにハッシュとバージョンを付与
* **受け入れ基準**: 生成物の実行でA1の主要統計が±1%以内で再現、依存関係リストを同梱
* **KPI**: 再現失敗率≤2%、引き継ぎ工数↓
* **LLM非機能**: p95≤8s、0.8円/1K tokens上限
* **Observability**:

  * `event_name`: `EDARecipeEmitted`
  * `properties`: `{artifact_hash, files:["recipe.json","eda.ipynb","sampling.sql"], model_id, tokens_used}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_d1`
  * `tool_calls`: `[{"name":"codegen_api","targets":["ipynb","sql"]}]`

---

### Capability E: **継続対話と高速応答**

**Story E1: セッション要約と高速フォローアップ**

* **Given** 直近の対話履歴が長くなっている
* **When** システムが履歴を要約バッファに圧縮し、軽量モデルへ切替
* **Then** フォローアップ質問にp95≤2sで回答（数値はキャッシュ参照、計算は必要時のみ）
* **受け入れ基準**: 重要コンテキスト保持率≥0.95、誤回答率≤0.05
* **KPI**: レスポンス満足度、継続利用率
* **LLM非機能**: 0.2円/1K tokens上限、rps≥5（同時ユーザー対応）
* **Observability**:

  * `event_name`: `FollowupAnswered`
  * `properties`: `{session_id, summary_tokens, model_id, duration_ms}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_e1`
  * `tool_calls`: `[]`
