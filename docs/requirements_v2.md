## アプリ/ツール案（LLM活用・更新）— **AutoEDAアシスタント**

* **名前**: AutoEDAアシスタント
* **ターゲットユーザー**: DS / DE / PM（飲食・小売・通信 全案件横断）
* **コア課題 / JTBD**:

  1. アップロード or 接続データを**即座に品質診断・可視化**し、次アクションまで提案したい。
  2. **EDA計画（観点・タスク）を自動生成**し、人手で微修正しながら高品質に仕上げたい。
  3. **カスタム分析コードを自動生成→安全に実行→結果とコードを可視化＆ダウンロード**したい。
* **LLM設計（RAG/エージェント/関数呼び出し/構造化出力）**:

  * *RAG*: データ定義書・社内規約・可視化スタイル・過去EDA事例をVectorDB化（Top-k再ランク）。
  * *Web Search*: ドメイン指針（例：時系列EDAの定石、通信解約の定石指標）を**許可ドメイン**のみ検索し、出典付きで計画に反映。
  * *エージェント*: 「プロファイリング→計画生成→可視化→コード生成→検証→提示」のサブルーチンをツール呼び出しで連携

    * `profile_api`, `chart_api`, `stats_api`, `pii_scan`, `web_search`, `code_exec`（安全サンドボックス）, `notebook_builder`
  * *構造化出力*:

    * **EDA計画**: `plan.tasks[]`（`id`, `title`, `why`, `inputs`, `tool`, `acceptance`, `depends_on[]`, `risk`, `est_time`）
    * **EDA結果**: `distributions[]`, `key_features[]`, `outliers[]`, `data_quality_report`, `next_actions[]`
  * *プロンプト方針*: System/Dev/Userの分層、**数値はツール結果のみ採用（推測禁止）**、**JSON Schema必須**。
  * *キャッシュ/再ランク*: データ辞書Q\&A・計画案は短期キャッシュ、根拠文書は再ランクで精度担保。
* **差別化キーフィーチャ**: 反証探索CoT／ソース自動引用／セマンティック監査／期待値テスト／PII・リーク検査／**計画⇄実行の往復最適化**（計画更新がコード生成に即反映）
* **品質向上メカニズム**: 「ツール実行→LLM要約→検証器（ルール&軽量LLM）→補完検索」の4段ループ。Groundedness/引用被覆率/ハルシネーション率@k/再現性を継続測定。
* **セキュリティ/プライバシー/ガードレール**:

  * `code_exec`は**ネットワーク遮断サンドボックス**・CPU/メモリ/時間リミット・**許可ライブラリ白リスト**（例：pandas, numpy, matplotlib, scikit-learn（学習は禁止）等）
  * PIIマスキング、Prompt Injectionフィルタ、出力ポリシーチェック（秘密情報・危険API呼び出しの抑止）
* **KPI**（先行/遅行）: Groundedness≥0.9、引用被覆率≥0.8、一次解決率↑ / EDA工数▲50%・着手〜一次仮説LT▲40%・案件粗利%↑・SLA遵守
* **参考アーキテクチャ（Text図）**:

  ```
  Sources(DB/CSV/Docs)
      └─ ETL & Profiling (stats_api, pii_scan)
           └─ Chunking/Embeddings → VectorDB
                └─ Retriever + Reranker + WebSearch(allowlist)
                     └─ Orchestrator(EDA Agent)
                          ├─ Policy/Safety
                          ├─ Tool Calls: profile_api | chart_api | stats_api | code_exec | notebook_builder
                          └─ LLM (structured JSON)
                                 └─ Evaluator(groundedness/consistency)
                                      └─ Observability(Log/metrics/traces)
  ```
* **Build vs Buy・主要リスクと軽減**:

  * *Build*: 既存OSS＋APIの統合で高い拡張性／ドメイン適合。
  * *Buy*: BI/ETLのLLM機能併用で導入迅速だがカスタム度は低い。
  * *リスク*: レイテンシ/コスト、コード実行安全性、過一般化。→ サンプリング＋前段要約、**関数結果のみ採用**、サンドボックス強化・人手レビューフローで軽減。

---

## ユーザーストーリー（LLM前提）— **Epic: AutoEDAで計画生成から実行・可視化までを自動化**

> 既存の Capabilities A〜E を保持しつつ、新規 **Capability F（EDA計画生成）** と **Capability G（カスタム分析実行）** を追加しました。重複する「ノートブック出力」は **Story D1** を拡張し、**カスタム分析の成果も一括出力**できるよう統合しています。

### Capability A: **データ概要レポート生成**  *(既存)*

**Story A1（既存）** / **Story A2（既存）** — 変更なし（整合性検査の閾値・SLOは現状維持）

---

### Capability B: **インタラクティブQ\&Aと仮説提案**  *(既存)*

**Story B1（既存）** / **Story B2（既存）** — 変更なし（引用被覆率≥0.8を維持）

---

### Capability C: **データ品質・PII・リーク検査**  *(既存)*

**Story C1（既存）** / **Story C2（既存）** — 変更なし

---

### Capability D: **再現可能なEDAレシピ出力**  *(既存・拡張)*

**Story D1: ノートブック/SQL/レシピの一括生成（A〜C & Gの成果を含む）**

* **Given** A1〜C2 の自動結果、**および G（カスタム分析）で実行したコード・結果**が揃っている
* **When** ユーザーが「成果物を出力」を選択
* **Then** `recipe.json`（タスク列）、`eda.ipynb`（自動EDA）、`analysis.ipynb`（**カスタム分析**）、`sampling.sql` を生成し、**ハッシュ/バージョン**付与
* **受け入れ基準**: 生成物でA1主要統計が±1%以内再現、**Gで生成した指標/図も再現**、依存パッケージ一覧同梱
* **KPI**: 再現失敗率≤2%、引き継ぎ工数↓
* **LLM非機能**: p95≤8s、≤0.8円/1K tokens
* **Observability**:

  * `event_name`: `EDAArtifactsEmitted`
  * `properties`: `{artifact_hash, files:["recipe.json","eda.ipynb","analysis.ipynb","sampling.sql"], model_id, tokens_used}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_d1_ext`
  * `tool_calls`: `[{"name":"notebook_builder","targets":["ipynb","sql"]}]`

---

### Capability E: **継続対話と高速応答**  *(既存)*

**Story E1（既存）** — 変更なし

---

### ✅ **Capability F: EDA計画生成（観点設計・タスク化）**  *（新規）*

**Story F1: データ定義・目的に基づくEDA計画の自動生成（RAG＋Web Search）**

* **Given** ユーザーが「分析対象CSV」「データ定義書（JSON/CSV）」「分析目的/目標（Markdown）」を投入
* **When** システムが RAG と **許可ドメイン限定の web\_search** を用い、**観点→タスク**にブレークダウン（`plan.tasks[]`）
* **Then** `plan.tasks[]` に各タスクの `why / inputs / tool / acceptance / depends_on / risk / est_time` を埋め、**各タスクに根拠ソース（RAG or Web）を付与**
* **受け入れ基準**:

  * `plan.tasks[].acceptance` が**検証可能な条件**（例：統計量・閾値・図ID）で記述
  * 引用被覆率≥0.8、groundedness≥0.9、p95≤6s（長文はサマリRAG）
* **KPI**: 計画レビュー一次合格率、見落とし指標検出率、再作業削減%
* **LLM非機能**: ≤0.6円/1K tokens、モデル切替（計画生成=高精度、校正=軽量）、rps≥3
* **Observability**:

  * `event_name`: `EDAPlanProposed`
  * `properties`: `{task_count, coverage_score, sources_count, model_id, tokens_used, duration_ms}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_f1`
  * `tool_calls`: `[{"name":"vector_search","k":8},{"name":"web_search","allowlist":true}]`

**Story F2: 人手レビューと差分適用（計画のUI内修正）**

* **Given** F1の計画がUIに表示され、ユーザーが違和感点をコメント or **プロンプトで修正指示**
* **When** システムが指示を**パッチ化**（追加/変更/削除）し、**整合性検査**（循環依存・欠落入力）を実行
* **Then** `plan.v2` を作成し、**差分（diff）と影響範囲**（依存タスク）を提示
* **受け入れ基準**: 依存関係の循環=0、入力未解決=0、受入条件の曖昧表現（例：十分に・適切に）=0
* **KPI**: レビュー回数↓、ユーザー修正反映時間↓
* **LLM非機能**: p95≤2s（差分計算）、≤0.2円/1K tokens
* **Observability**:

  * `event_name`: `EDAPlanRevised`
  * `properties`: `{plan_version_from,to, patch_stats:{add,mod,del}, model_id}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_f2`
  * `tool_calls`: `[]`

---

### ✅ **Capability G: EDA実施（カスタム分析のコード生成・実行）**  *（新規）*

**Story G1: 計画タスクに基づく**安全サンドボックスでの**コード自動生成・実行**

* **Given** 承認済み `plan.tasks[]` と入出力（CSV/定義書/目的）が確定
* **When** システムが各タスクごとに `code_exec` 用の**安全テンプレ**（I/O・可視化・検証フック）に沿って Python/SQL を生成・実行
* **Then** **実行ログ・図表・中間成果**を保存し、UIに**コード＋結果＋根拠**を並列表示（再実行/パラメータ変更可）
* **受け入れ基準**:

  * `code_exec` は**ネットワーク遮断**・時間≤60秒・メモリ≤2GB・**ライブラリ白リスト**遵守
  * 結果の**検証フック**（`acceptance`）を自動実行し、合格/不合格を明示
  * p95実行時間≤15s（大型はサンプリング実行を許可）
* **KPI**: 一発合格率、再実行回数/タスク、失敗→原因自動分類率
* **LLM非機能**: ≤0.6円/1K tokens、ジョブ同時実行数（並列度）= N（環境に依存）
* **Observability**:

  * `event_name`: `CustomCodeExecuted`
  * `properties`: `{task_id, lang, packages_used, duration_ms, exit_code, tests_passed}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_g1`
  * `tool_calls`: `[{"name":"code_exec","timeout_sec":60,"whitelist":["pandas","numpy","matplotlib","scipy","scikit-learn-core"]}]`

**Story G2: 人手の深掘り指示→再生成・再実行（対話的カスタム分析）**

* **Given** ユーザーが「このチャートに信頼区間を追加」「週次集計に切替」など**UIのプロンプト**で深掘り指示
* **When** システムが**差分コード**を生成し、`code_exec` で再実行（過去結果と**並列比較**）
* **Then** 変更点・影響指標（例：平均/分散/お作法チェック）を**差分レポート**として提示
* **受け入れ基準**: 差分パッチの安全検査に合格（危険API/過剰I/Oなし）、結果の検証フックを再評価
* **KPI**: 深掘り→意思決定までのLT、差分適用の一次成功率
* **LLM非機能**: p95≤6s、≤0.4円/1K tokens
* **Observability**:

  * `event_name`: `CustomCodePatched`
  * `properties`: `{task_id, patch_stats:{add,mod,del}, duration_ms, tests_passed}`
  * `pii_flag`: false
  * `prompt_hash`: `eda_v1_g2`
  * `tool_calls`: `[{"name":"code_exec","timeout_sec":60}]`

> **ノートブック出力**は **Story D1** で統合済み（`analysis.ipynb` に G1/G2 のコード・結果・図をすべて収録、セル順は `plan.tasks[]` に追従）。

---

### ✅ **Capability H: チャート提案→LLM生成・表示・一括実行**  *（新規）*

> Chartsページの「提案→生成→表示」体験をP0→P1→P2の段階で定義。生成は安全サンドボックスで行い、Vega-Lite優先（可能なら）で再現性・VRテスト適合を高める。

P0（最小機能）

**CH-01: 提案カードに“チャート作成”ボタン**
- Given 提案一覧が表示されている
- When 任意の提案カードで“チャート作成”を押す
- Then 対象データセット/使用カラム/チャート種別/ライブラリの確認モーダルが開く

**CH-02: 生成リクエスト送信と進捗表示（単発/バッチ両対応）**
- Given モーダルで内容を確認
- When “生成を開始”を押す
- Then 段階インジケータ（準備→コード生成→実行→レンダリング）と、バッチ時は「N件中M件完了」を表示

**CH-03: LLMコード生成と安全実行（サンドボックス）**
- Given LLMキーが設定済み
- When 生成ジョブ開始
- Then ネットワーク遮断・CPU/メモリ/時間制限・許可ライブラリのみでコード実行

**CH-04: 成功時の結果表示**
- Given 正常終了して画像/Vega-Lite spec を返す
- Then 提案カード直下にプレビューを挿入し、「可視化/コード/メタデータ」タブ切替可

**CH-05: 失敗時の理由提示とフォールバック**
- Given 空応答/安全フィルタ/JSON不正/実行失敗
- Then 人間可読の理由を表示し、テンプレチャート（ヒスト/棒/散布）へフォールバック可能

**CH-06: 再実行とパラメータ調整**
- Given プレビュー表示中
- When 対象列/集計単位を変更して再実行
- Then 新しい結果を再描画し、前回結果は履歴1件保持

**CH-07: コード確認とコピー**
- Then 読み取り専用コードを表示し、コピー可能

**CH-08: ダウンロード**
- Then PNG（画像）/JSON（Vega-Lite）を保存可能

P1（使い勝手/安全性の強化）

**CH-09: 事前バリデーションと推奨列の自動選択**
- Then 欠損/型不整合の警告と推奨列の自動選択

**CH-10: 実行前承認フロー（オプション）**
- Then コード差分プレビュー→「承認して実行」でのみ実行

**CH-11: 実行制限とキャンセル**
- Then 1件タイムアウト（例10s）超過時に中断、ユーザー中止も可能

**CH-12: レート制限とキュー**
- Then 同時実行上限を超えた分は待機キューへ

**CH-13: 段階的フォールバック**
- Then LLM失敗時に「テンプレ→軽量LLM→再試行（指数バックオフ最大3回）」

**CH-14: 追跡可能性（メタデータ）**
- Then model_id/温度/シード/ライブラリ/実行時間/データ行数などを結果に付与しログ化

**CH-15: アクセシビリティ**
- Then ARIA/フォーカストラップ/モーション抑制に準拠

P2（保存/共有/再現性）

**CH-16: チャート保存と一覧**
- Then 「My Charts」へ保存し、一覧から再表示（サムネイル付）

**CH-17: バージョン管理**
- Then v1/v2… でパラメータ/コード差分を参照・復元

**CH-18: 共有リンク/エクスポート**
- Then 読み取り専用リンク/Notebookセル（コード+画像）を出力

**CH-19: ダッシュボードへのピン留め**
- Then ドラッグ整列可能なカードとして配置

一括選択/一括生成（追加）

**CH-20: 複数選択（チェックボックス）**
- Given 提案一覧
- When 各カードのチェックボックスを選択/解除、または「全選択」
- Then 上部に選択数バッジ（例“3件選択”）と「一括生成」ボタン（未選択時は無効）
- 受け入れ: 個別/全選択/全解除、フィルタ・ソート変更でも選択維持（ページ離脱で破棄）、キーボード操作可

**CH-21: 一括生成（バッチ処理）**
- Given 1件以上選択
- When 「一括生成」を押下
- Then `batch_id` を取得し、バッチ進捗（N中M）と各カードの個別進捗を表示
- 受け入れ: 既定並列度=3（環境可変）、部分成功は続行、失敗は個別リトライ（最大3回/指数バックオフ）、結果は各カード直下に表示、エラーは人間可読、job_id/batch_idを保持

API / データ契約（ドラフト）

- 単発: `POST /api/charts/generate { dataset_id, spec_hint, columns[], library?, seed? }`
- 一括: `POST /api/charts/generate:batch { dataset_id, items:[{spec_hint, columns[], ...}], parallelism? }`
- ステータス: `GET /api/charts/jobs/{job_id}` / `GET /api/charts/batches/{batch_id}`
- 出力（推奨JSON）: `{ language:'python', library:'vega'|'altair'|'matplotlib', code, seed, outputs:[{ type:'image'|'vega', mime:'image/png'|'application/json', content(base64|json) }] }`

NFR / セキュリティ / Observability（追加）

- セキュリティ: `code_exec` はネットワーク遮断・只読データ・時間≤10s（1件）・メモリ≤512MB・**許可ライブラリ**（pandas/numpy/altair/vega-lite/matplotlib）
- 再現性: シード固定、Vega-Lite優先。CIでVR（Linuxベースライン）を更新・比較
- 性能目標: p95 生成〜描画 ≤6s（LLM待ち含む）
- 監視イベント: `ChartGenerationRequested/Started/Progress/Completed/Failed`, `ChartBatchStarted/Progress/Completed`
- 指標: バッチ成功率、平均レイテンシ、失敗理由内訳、VR差分率

備考・整合

- Capability G（カスタム分析）と整合: CHは可視化に特化。コード生成・実行の基盤（サンドボックス/承認/メトリクス）はGを再利用
- D1（ノートブック出力）と整合: 保存・共有（CH-16〜18）はD1の出力パイプへ連携可能

---

### 補足（運用SLOと安全ガード）

* **SLO例**: 計画生成 p95≤6s、カスタム実行 p95≤15s、全体可用性99.9%、重大インシデント MTTR≤30分。
* **安全**: すべてのLLM出力は**根拠必須**・**危険API禁止**・**PIIマスク後にモデル投入**。`code_exec` はネットワーク遮断・一時FS・権限分離。
* **監査**: すべてのイベントに `prompt_hash / model_id / tool_calls[] / tokens_used / pii_flag / retention` を付与。
