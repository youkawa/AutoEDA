# AutoEDA 実装計画 (タスクトラッカー)

更新日: 2025-09-20 / 担当: AutoEDA Tech Lead（追記: H2 公正度UI/SLO/Plan UI 反映）

---

## 1. 現状サマリ（2025-09-20 時点）

- バックエンド API (A1〜D1, C1/C2, S1) は実装済みで、メトリクスイベントも出力。
- Capability H は P0 中核（CH-01/02/04/08/20/21）に加え、以下を実装/前進：
  - CH-07: コードコピー（UI） — Done
  - CH-06: 再実行＋履歴1件保持（単発） — Partial
  - CH-02: 単発ステップUIをサーバ `stage` 同期（generating/rendering/done） — Done(単発)
  - CH-12: 並列ワーカープール（ENV: `AUTOEDA_CHARTS_PARALLELISM`） — Done(初期)
  - バッチ: `parallelism_effective` 厳守とフェアスケジューラ（RR） — Done(初期)
  - 公正性メトリクス: `/api/charts/batches/{id}` で `served`/`avg_wait_ms` を返却、`ChartsPage` の進捗バーに R/Q/F/C/S（served）と平均待機(ms)を表示、live region 読み上げ — Done(初期)
  - CH-11: 協調キャンセル（runningにcancel flag伝播） — WIP（UIはキュー/実行中の一括キャンセルに対応）
  - CH-14: メタ拡充（engine/sandbox/parallelism/duration） — Done(初期)
  - CH-03: 実行MVP（`AUTOEDA_SANDBOX_EXECUTE=1` で安全サブプロセス実行） — WIP（LLM透過は未）
  - バッチ: `parallelism`受理＋`parallelism_effective` 返却（ENV上限内）。スケジューラでバッチ単位の同時実行上限を遵守 — Done(初期)
  未了: CH-05 / CH-06（編集UI）/ CH-11（協調中断の強化）/ CH-13 / CH-16〜19。
- Capability F/G：
  - F1: `/api/plan/generate` — Done(MVP/API)
  - F2: `/api/plan/revise` — Done(MVP/検証のみ)（循環/未解決/曖昧受入の検証、400整形）。差分パッチ生成は今後
  - PlanPage（UI雛形）を追加し、ソート/フィルタ/未解決依存の可視化/JSONダウンロードを提供 — Done(初期)
  - G系は未実装（実行基盤はHのMVPを流用可能）
- フロントは主要ページが実装済み。Storybook は導入済み（MSW/Router/Docs/A11y、VR運用まで整備）。
- テスト: pytest + Vitest + Playwright（Storybook VR）。Charts の代表ケースをVR対象に追加済み。
- CI: web ジョブで Lint/Type/Vitest/API検証/Storybook/VR まで実行。main 保護は有効、必須チェック contexts は固定済み（"ci / web"）。
- 観測: `/api/metrics/slo` の閾値を `AUTOEDA_SLO_THRESHOLDS` で上書き可能にし、Home の SLO タイルに OK/NG バッジを表示 — Done(初期)
- 安定化: RAG 初期化競合の逐次化、Gemini セーフティ理由表示、EDA StrictMode デデュープ、Mermaid 図の整備を完了。

---

## 2. タスク一覧（優先度つき）

| ID | スコープ | 状態 | 実装リファレンス | 次アクション |
|----|----------|------|------------------|--------------|
| T-A1-01 | `POST /api/eda` プロファイル生成 | **Done** | `apps/api/services/tools.py::profile_api`, `orchestrator.generate_eda_report` | テスト: 大容量 CSV のサンプリング検証を追加 (pytest) |
| T-A2-01 | チャート提案 + 整合性検査 | **Done** | `apps/api/services/tools.py::chart_api`, `evaluator.consistency_ok` | Storybook で `ChartsPage` の有無パターンを作成 |
| T-B1-01 | Q&A API + UI | **Done** | `apps/api/services/tools.py::stats_qna`, `apps/web/src/pages/QnaPage.tsx` | LLM 有効時の JSON マージをテスト (モック) |
| T-B1-02 | 追質問フォローアップ | **Done** | `apps/api/services/tools.py::followup` | Playwright で追質問シナリオ追加 |
| T-B2-01 | 次アクション優先度付け | **Done** | `apps/api/services/tools.py::prioritize_actions`, `ActionsPage` | WSJF/RICE の境界条件テスト |
| T-C1-01 | PII 検出 / マスク適用 | **Done** | `apps/api/services/tools.py::pii_scan`, `PiiPage` | 正規表現ヒット率の自動テスト追加 |
| T-C2-01 | リークリスク検査 | **Done** | `apps/api/services/tools.py::leakage_scan`, `LeakagePage` | 実データを用いた検証ケースを追加 |
| T-D1-01 | レシピ生成 & ±1% 検証 | **Done** | `apps/api/services/tools.py::recipe_emit`, `RecipesPage` | notebooks/SQL の単体テストを pytest で追加 |
| T-S1-01 | LLM 資格情報 API + UI | **Done** | `apps/api/main.py (credentials)`, `SettingsPage` | 401/403 ハンドリング (API Key 無効時) を実装 |
| T-U1-01 | CSV アップロード UI | **Done** | API は `apps/api/main.py:95` | `Datasets` にアップロード導線を追加、`client-sdk.uploadDataset` 実装 |
| T-UX-01 | ナビゲーション改善 | **Done** | `AppLayout`, `Breadcrumbs` | アクティブ表示/パンくず（Esc対応のModalと併せUX改善） |
| T-UI-01 | Storybook 導入/運用 | **Done** | `docs/storybook.md`, `.storybook/*` | MSW/Router/Docs/A11y 設定、VR連携、reduce motion/フォント/日時固定 |
| T-TEST-01 | API 単体テスト拡充 | **WIP** | `tests/python` | `test_upload.py` 追加、今後 `test_tools_profile.py` などを拡充 |
| T-TEST-02 | フロント UI テスト拡充 | **WIP** | `apps/web/src/tests` | `breadcrumbs.test.tsx` 追加。ページスナップショットは順次拡充 |
| T-TEST-03 | Playwright シナリオ更新 | **TODO** | `tests/e2e` | Settings/Recipes/Leakage を包含する E2E |
| T-INF-01 | Docker サンドボックス | **Done** | `infra/docker/*`, `docker-compose.dev.yml` | `docker compose up` で web/api 同時起動 (Node20+Py3) |
| T-INF-02 | GitHub Actions ワークフロー | **Done** | `.github/workflows/ci.yml` | 既存のwebジョブにてLint/Type/Vitest/OpenAPI/Storybook/VR 実行 |
| T-DOC-01 | Storybook/Wireframe 同期 | **Done** | `docs/storybook.md`, `docs/wireframe.md` | 今後の UI 変更時に更新 |
| T-DOC-02 | 設計/要件同期 | **Done** | `docs/design.md`, `docs/requirements.md` | SLO/フォールバック値のモニタリング継続 |

### 2.1 Capability H（チャート生成：設計→実装）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-H0-00 | 基本設計・要件反映 | **Done** | `docs/requirements_v2.md`（CH-01〜21）, `docs/design.md` 3.6H, `docs/diagram.md`, `docs/wireframe.md` | 設計/図/ワイヤー/Storybook ガイド同期済み |
| T-H1-API | 単発生成API `/api/charts/generate` | **Done(MVP/非同期キュー)** | `services/charts.py` | 同期/非同期（`AUTOEDA_CHARTS_ASYNC`）両対応。ジョブ保存 `data/charts/<job_id>` |
| T-H1-FE | 「チャート作成」ボタン〜結果表示 | **Done(MVP)** | `ChartsPage`, `client-sdk` | SDKポーリング対応で非同期完了待ち。タブ/ダウンロード/エラー提示実装済み |
| T-H1-VR | Charts 単発 Story + VR | **Done(初期)** | `ChartsPage.stories.tsx`, `tests/storybook/charts.spec.ts` | ConsistentOnly/Empty のスナップショット（Linuxベースライン） |
| T-H2-API | 一括生成 `/api/charts/generate-batch` + ジョブ/バッチステータス | **Done(MVP/非同期ポーリング)** | `services/charts.py` | 非同期時は`batch_id`のみ返却→進捗/結果は`GET /api/charts/batches/{id}`で集計 |
| T-H2-FE | 複数選択・一括生成バー/進捗 | **WIP(分解表示)** | `ChartsPage` | R/Q/F/C/served の分解表示と live region 統一。avg_wait を表示 |
| T-HSEC | サンドボックス実行基盤 | **WIP** | `apps/api/services/sandbox.py` | MVP導入（NWブロック/メモ制限のフック）。将来subprocess隔離/allowlist導入 |
| T-HOBS | メトリクス/監視 | **WIP** | `metrics.record_event` | ChartJobFinished/ChartBatchFinished を記録。KPI集計のAPI/可視化は今後 |

#### 2.1.1 追加タスク（未実装の CH に対応）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-H1-STEP | 単発ステップUIを実処理に連動（CH-02） | **Done(単発)** | `ChartsPage`, `client-sdk` | progressコールバックでstage=generating/rendering/doneを反映 |
| T-H1-STEP | 単発ステップUIを実処理に連動（CH-02） | **Done(単発)** | `ChartsPage`, `client-sdk` | SDKのprogressポーリングでstage=generating/rendering/doneを反映 |
| T-H2-FAIR | バッチ間フェアスケジューラ | **Done(初期)** | `charts.py` | 簡易RRで飢餓を回避（_LAST_SERVED_BATCH）。今後は公正性メトリクスで監視 |
| T-H1-EXEC | LLMコード生成＋安全実行（CH-03） | **WIP(実行基盤MVP)** | `sandbox.py`, `charts.py` | `AUTOEDA_SANDBOX_EXECUTE=1` で安全サブプロセス実行（Vega JSON生成）＋ cancel/timeout 監視。今後LLM透過化 |
| T-H1-FAIL | 失敗理由提示とテンプレフォールバック（CH-05） | **TODO** | FE/SDK 例外整形 | 空応答/安全フィルタ/JSON不正の理由を人間可読で提示、テンプレへ退避 |
| T-H1-RERUN | パラメータ調整→再実行（履歴1件）（CH-06） | **TODO** | `ChartsPage` | 列/集計単位の編集UI、直前結果の履歴保持・復元 |
| T-H1-COPY | コード表示＋コピー（CH-07） | **Done** | `ChartsPage` | 「コードをコピー」ボタン追加（クリップボード書込） |
| T-H1-META | メタデータ拡充（CH-14） | **Done(初期)** | `charts.py`, `sandbox.py` | engine/sandbox/parallelism/seed/duration_ms を `result.meta` に付与 |
| T-H2-CANCEL | running の協調中断（CH-11） | **WIP(協調キャンセル)** | `charts.py` | running ジョブに cancel flag を伝搬し完了時に cancelled へ（中断ポイント導入は今後） |
| T-H2-QUEUE | 並列度cap/キュー制御（CH-12） | **Done(初期)** | `charts.py` | ワーカープール（ENV）。バッチ`parallelism`受理＋effective算出・遵守 |
| T-H2-STEP | バッチ進捗UI（items[].stage反映） | **WIP** | `ChartsPage` | カード上に stage ピル（生成中/描画中/完了）表示 — 追加済み、さらなる連動は今後 |
| T-H2-BACKOFF | 段階的フォールバック+再試行（CH-13） | **TODO** | FE/SDK/API | テンプレ→軽量LLM→指数バックオフ再試行（最大3回） |

#### 2.1.2 Capability H — 保存/共有（P2）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-H3-SAVE | チャート保存/一覧（CH-16） | **TODO** | API/SDK/FE | `POST /api/charts/save` / `GET /api/charts` 的な最小API＋UI一覧（サムネ付） |
| T-H3-VERS | バージョン管理（CH-17） | **TODO** | API/SDK/FE | v1/v2…の差分表示・復元。メタに `version` を保持 |
| T-H3-SHARE | 共有リンク/エクスポート（CH-18） | **TODO** | API/FE | 読取専用リンク生成、Notebookセル（コード+画像）出力 |
| T-H3-PIN | ダッシュボードへピン留め（CH-19） | **TODO** | FE | Home/Dashboard にカード配置・整列（ドラッグ） |

## 3. 次のイテレーション（優先順）

1. H2 スケジューラ仕上げ（中〜高）：バッチごとの同時実行上限を厳密に遵守（先着順/公正性）し、UIのstage連動を強化（items[].stage の更新頻度/完了announceの統一）
2. H1‑EXEC 強化（高）：allowlist インポート検査（ast/deny-list）、チェックポイント（長処理ループへのyield）追加、失敗理由の詳細提示（CH‑05）
3. F2 UI 雛形（中）：Plan の一覧/詳細と検証結果表示、`/plan/:datasetId` を追加。差分適用のUIは後続
4. CH‑13（中）：段階フォールバック（テンプレ→軽量LLM→指数バックオフ再試行）
5. 保存/共有（CH‑16〜19）（中）：最小の保存API＋一覧→Notebookセル出力
6. CI/観測（中）：H系KPI（p95/成功率/失敗理由）を `metrics.slo_snapshot` に取り込み、Homeに表示

## 4. 未実装ユーザーストーリー（requirements_v2 由来・現状反映）

| Story | 状態 | 対応タスク | 備考 |
|-------|------|------------|------|
| F1: 計画自動生成 | Done(MVP/API) | `T-F1-PLAN` | RAG+プロファイル骨子（決定的） |
| F2: 人手レビュー・差分適用 | Done(MVP/検証) | `T-F2-REVISE` | 差分生成は後続、検証は実装 |
| G1: カスタム分析の生成・実行 | 未実装 | `T-G1-EXEC` | 実行基盤はHのMVPを流用可能 |
| G2: 深掘り指示の再生成 | 未実装 | `T-G2-INTERACTIVE` | |
| CH-03/05/06/11/13/16〜19 | 一部/未実装 | `T-H1-EXEC`/`T-H1-FAIL`/`T-H1-RERUN`/`T-H2-*`/`T-H3-*` | 07/14は初期Done、02は単発Done、12は初期Done |

### 2.2 安定化・不具合修正（完了）

| ID | 内容 | 状態 | リファレンス | 備考 |
|----|------|------|--------------|------|
| T-FIX-01 | RAG/Chroma 初期化競合の逐次化＋テレメトリ無効 | **Done** | `apps/api/services/rag.py` | get_or_create の競合時フォールバック、lock 追加 |
| T-FIX-02 | Gemini セーフティ理由の人間可読化＋OpenAI応答抽出強化 | **Done** | `apps/api/services/orchestrator.py` | `_gemini_block_message` 追加、`_extract_text` を Responses API 形に対応 |
| T-FIX-03 | EdaPage StrictMode 二重リクエストのデデュープ | **Done** | `apps/web/src/pages/EdaPage.tsx` | inflightMap で同一datasetIdを集約 |
| T-FIX-04 | Mermaid 図のパースエラー修正 | **Done** | `docs/diagram.md` | サイトマップ/状態遷移の構文修正（セミコロン/ラベル） |

### 2.3 CI / 運用

| ID | 内容 | 状態 | リファレンス | 次アクション |
|----|------|------|--------------|--------------|
| T-CI-01 | main ブランチ保護（PR必須/レビュー/Auto-merge） | **Done** | GH 設定 | 必須チェック contexts を固定（例: `ci / web`） |
| T-CI-02 | 必須チェック contexts 追加 | **Done** | GH API | `required_status_checks/contexts` に `ci / web` を登録済み |
| T-CI-03 | Storybook VR を継続運用 | **WIP** | `tests/storybook/*.spec.ts` | OS別ベースライン運用、差分閾値 0.01–0.03、レポート保全 |

---

## 3. 次のイテレーション（優先順）

1. H2 スケジューラ仕上げ（中〜高）：announcer 文言の完全統一、served/avg_wait の説明（ツールチップ/ヘルプ）を恒常化。公正性の可視化（served比率/平均待機の時系列）
2. H1‑EXEC 強化（高）：AST deny‑list拡張（import/exec系）、詳細エラーのAPI整形（type=timeout/cancelled/forbidden_import/format_error）、テンプレ系にも協調中断
3. F2 UI 雛形拡充（中）：Plan の並べ替え/フィルタ、依存の視覚化、検証結果の強調表示
4. CH‑13（中）：段階フォールバック（テンプレ→軽量LLM→指数バックオフ再試行）
5. 保存/共有（CH‑16〜19）（中）：最小保存API＋一覧→Notebookセル出力
6. CI/観測（中）：H系KPI（p95/成功率/失敗理由）を `metrics.slo_snapshot` に取り込み、Homeカードに色分け表示（閾値のenv化）

---

## 4. 未実装ユーザーストーリー（requirements_v2 由来）

| Story | 状態 | 対応タスク | 備考 |
|-------|------|------------|------|
| F1: 計画自動生成 | Done(MVP/API) | `T-F1-PLAN` | RAG+プロファイル由来の骨子（決定的） |
| F2: 人手レビュー・差分適用 | Done(MVP/検証) | `T-F2-REVISE`, `T-F2-UI` | 検証API実装/Plan UI雛形。差分パッチは後続 |
| G1: カスタム分析の生成・実行 | 未実装 | `T-G1-EXEC` | サンドボックス `code_exec` 実運用化 |
| G2: 深掘り指示の再生成 | 未実装 | `T-G2-INTERACTIVE` | 差分パッチ生成・再実行・比較 |
| CH-03/05/06/11/12/13/16〜19 | 一部/未実装 | `T-H1-EXEC`/`T-H2-*`/`T-H3-*` | 07/14はDone、02は単発Done、12は初期Done |
| CH-16〜19 | 未実装 | `T-H3-*` | 保存/共有/バージョン/ピン留め |

### 4.1 追加タスク定義（F/G）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-F1-PLAN | 計画生成 API/UI | **Done(MVP/API)** | `docs/requirements_v2.md` F1 | `POST /api/plan/generate` 実装（RAG+プロファイル由来の骨子）。UI/保存は今後 |
| T-F2-REVISE | 計画差分適用 | **Done(MVP/検証のみ)** | F2 | `/api/plan/revise` に循環/未解決/曖昧受入の検証を実装（400整形）。差分生成は今後 |
| T-G1-EXEC | カスタム実行基盤 | **TODO** | G1 | `code_exec`（NW遮断/timeout/mem/whitelist）で各タスク実行、検証フック合格/不合格表示 |
| T-G2-INTERACTIVE | 深掘り対話 | **TODO** | G2 | プロンプト→差分コード→再実行→比較レポート、`CustomCodePatched` ログ |

---

## 5. リスクとフォロー

- **LLM 未設定率が高い**: フォールバックが常態化しないよう、Settings での API Key 設定 UX を改善 (入力検証・成功トースト)。
- **データ持ち出し**: `data/datasets` が Git 管理外だがローカルに残る。クリーンアップスクリプトを検討。
- **テストカバレッジ**: LLM 呼び出しが直接 SDK 依存のため、API キー無し CI でも動作するモックを整備する必要あり。
 - **生成コードの安全性**: Sandbox の制限が不十分だとホスト影響リスク。最初から NW遮断/権限分離/FS隔離/timeout/mem を強制。
 - **VRのブレ**: OS/フォント差分で微小ノイズ。preview.ts でブレ抑制しつつ、差分閾値を最小限に設定。

---

## 6. 変更履歴

- 2025-09-20: H1-STEP(単発)完了、CH-07/14 Done(初期)、CH-06 部分、CH-11 協調、CH-12 並列/バッチ有効化、CH-03 実行MVPを追加。F1/F2 のAPI実装（MVP）を反映。H2: `served`/`avg_wait_ms` を追加し `ChartsPage` に表示、PlanPage(初期) 追加、SLOタイルに OK/NG バッジ追加。
- 2025-09-19: Capability H の実装状況を反映（P0の一部=実装済み、未実装CHをタスク化）。Capability F/G の未実装を追加タスク化。RAG/Gemini/EDA 安定化、Storybook VR 運用、Mermaid修正、タスク表を更新。
- 2025-09-18: バックエンド/フロント実装状況に合わせてタスク表を更新。Storybook/ワイヤーフレーム同期タスクを完了扱いに。
- 2025-09-15: 初版。
\n
