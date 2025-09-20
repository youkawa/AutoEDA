# AutoEDA 実装計画 (タスクトラッカー)

更新日: 2025-09-19 / 担当: AutoEDA Tech Lead

---

## 1. 現状サマリ

- バックエンド API (A1〜D1, C1/C2, S1) は実装済みで、メトリクスイベントも出力。
- Capability H（チャート生成：CH-01〜CH-21）は P0 の中核（CH-01/02/04/08/20/21）と一部P1（A11y: CH-15、キュー: CH-12の一部=queuedのみキャンセル）をMVP実装済み。未了: CH-03（LLM実行本番化）/CH-05（詳細理由の提示強化）/CH-06（パラメータ再実行・履歴1件保持）/CH-07（コードのコピー）/CH-11（running中断）/CH-12（並列度制御）/CH-13（段階的フォールバック）/CH-14（メタ拡充）/CH-16〜19（保存・共有系）。
- Capability F/G（計画生成・カスタム分析）は未実装（要件・設計は v2 に定義済み）。
- フロントは主要ページが実装済み。Storybook は導入済み（MSW/Router/Docs/A11y、VR運用まで整備）。
- テスト: pytest + Vitest + Playwright（Storybook VR）。Charts の代表ケースをVR対象に追加済み。
- CI: web ジョブで Lint/Type/Vitest/API検証/Storybook/VR まで実行。main 保護は有効、必須チェック contexts は固定済み（"ci / web"）。
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
| T-H2-FE | 複数選択・一括生成バー/進捗 | **WIP** | `ChartsPage` | UIは実装済み。一括はSDKポーリングで結果反映（進捗/再試行は次イテレーション） |
| T-HSEC | サンドボックス実行基盤 | **WIP** | `apps/api/services/sandbox.py` | MVP導入（NWブロック/メモ制限のフック）。将来subprocess隔離/allowlist導入 |
| T-HOBS | メトリクス/監視 | **WIP** | `metrics.record_event` | ChartJobFinished/ChartBatchFinished を記録。KPI集計のAPI/可視化は今後 |

#### 2.1.1 追加タスク（未実装の CH に対応）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-H1-STEP | 単発ステップUIを実処理に連動（CH-02） | **TODO** | `ChartsPage`, `charts.py` | job/batch ステータスに応じて準備→生成→実行→描画を連動（擬似から実値へ） |
| T-H1-EXEC | LLMコード生成＋安全実行（CH-03） | **TODO** | `sandbox.py`, `orchestrator` | SandboxRunner を本実行モードに拡張（allowlist/timeout/mem/NW遮断）＋LLM透過コード生成の最小経路 |
| T-H1-EXEC | LLMコード生成＋安全実行（CH-03） | **WIP(実行基盤MVP)** | `sandbox.py`, `charts.py` | `AUTOEDA_SANDBOX_EXECUTE=1` で安全サブプロセス実行（Vega JSON生成）。今後LLM透過化 |
| T-H1-FAIL | 失敗理由提示とテンプレフォールバック（CH-05） | **TODO** | FE/SDK 例外整形 | 空応答/安全フィルタ/JSON不正の理由を人間可読で提示、テンプレへ退避 |
| T-H1-RERUN | パラメータ調整→再実行（履歴1件）（CH-06） | **TODO** | `ChartsPage` | 列/集計単位の編集UI、直前結果の履歴保持・復元 |
| T-H1-COPY | コード表示＋コピー（CH-07） | **TODO** | `ChartsPage` | 「コードをコピー」ボタン追加（クリップボード書込） |
| T-H1-META | メタデータ拡充（CH-14） | **Done(初期)** | `charts.py`, `sandbox.py` | engine/sandbox/parallelism/seed/duration_ms を `result.meta` に付与 |
| T-H2-CANCEL | running の協調中断（CH-11） | **WIP(協調キャンセル)** | `charts.py` | running ジョブに cancel flag を伝搬し完了時に cancelled へ（中断ポイント導入は今後） |
| T-H2-QUEUE | 並列度cap/キュー制御（CH-12） | **Done(初期)** | `charts.py` | `AUTOEDA_CHARTS_PARALLELISM` でワーカー数制御（デフォルト1） |
| T-H2-BACKOFF | 段階的フォールバック+再試行（CH-13） | **TODO** | FE/SDK/API | テンプレ→軽量LLM→指数バックオフ再試行（最大3回） |

#### 2.1.2 Capability H — 保存/共有（P2）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-H3-SAVE | チャート保存/一覧（CH-16） | **TODO** | API/SDK/FE | `POST /api/charts/save` / `GET /api/charts` 的な最小API＋UI一覧（サムネ付） |
| T-H3-VERS | バージョン管理（CH-17） | **TODO** | API/SDK/FE | v1/v2…の差分表示・復元。メタに `version` を保持 |
| T-H3-SHARE | 共有リンク/エクスポート（CH-18） | **TODO** | API/FE | 読取専用リンク生成、Notebookセル（コード+画像）出力 |
| T-H3-PIN | ダッシュボードへピン留め（CH-19） | **TODO** | FE | Home/Dashboard にカード配置・整列（ドラッグ） |

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

## 3. 次のイテレーション候補

1. **H1（単発生成の仕上げ）**: `T-H1-STEP`/`T-H1-EXEC`/`T-H1-FAIL`/`T-H1-RERUN`/`T-H1-COPY`/`T-H1-META` を順に実装。Storybookで状態再現→VR対象へ追加。
2. **H2（一括生成の強化）**: `T-H2-CANCEL`/`T-H2-QUEUE`/`T-H2-BACKOFF` を実装。並列度=ENV、失敗時の個別再試行+指数バックオフ、進捗UI連動。
3. **Sandbox 強化**: `T-HSEC` を継続（allowlist/NW遮断/timeout/mem をより厳格に）。安全に失敗する設計。
4. **Capability F/G 着手**: `T-F1-PLAN`（計画生成API+UI）→`T-F2-REVISE`（差分適用）→`T-G1-EXEC`（コード生成/実行）→`T-G2-INTERACTIVE`（深掘り）を段階導入。
5. **CI/観測**: VRレポート/アーティファクトの保存期間見直し。H系イベントのKPIダッシュ（p95/成功率/失敗理由）を `metrics.slo_snapshot` 拡張で可視化。
6. **E2E 拡充 (T-TEST-03)**: Settings プロバイダ切替・Charts 成功/失敗・Recipes の一連シナリオ。

---

## 4. 未実装ユーザーストーリー（requirements_v2 由来）

| Story | 状態 | 対応タスク | 備考 |
|-------|------|------------|------|
| F1: 計画自動生成 | 未実装 | `T-F1-PLAN` | RAG+WebSearch/JSON Schema/整合検査含む |
| F2: 人手レビュー・差分適用 | 未実装 | `T-F2-REVISE` | 循環/未解決入力=0、diff提示 |
| G1: カスタム分析の生成・実行 | 未実装 | `T-G1-EXEC` | サンドボックス `code_exec` 実運用化 |
| G2: 深掘り指示の再生成 | 未実装 | `T-G2-INTERACTIVE` | 差分パッチ生成・再実行・比較 |
| CH-03/05/06/07/11/12/13/14 | 未実装/一部 | `T-H1-EXEC` ほか | 上記 2.1.1 の各タスクを参照 |
| CH-16〜19 | 未実装 | `T-H3-*` | 保存/共有/バージョン/ピン留め |

### 4.1 追加タスク定義（F/G）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-F1-PLAN | 計画生成 API/UI | **Done(MVP/API)** | `docs/requirements_v2.md` F1 | `POST /api/plan/generate` 実装（RAG+プロファイル由来の骨子）。UI/保存は今後 |
| T-F2-REVISE | 計画差分適用 | **TODO** | F2 | パッチ生成・循環/未解決=0 を満たす検証、`EDAPlanRevised` ログ |
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

- 2025-09-19: Capability H の実装状況を反映（P0の一部=実装済み、未実装CHをタスク化）。Capability F/G の未実装を追加タスク化。RAG/Gemini/EDA 安定化、Storybook VR 運用、Mermaid修正、タスク表を更新。
- 2025-09-18: バックエンド/フロント実装状況に合わせてタスク表を更新。Storybook/ワイヤーフレーム同期タスクを完了扱いに。
- 2025-09-15: 初版。
\n
