# AutoEDA 実装計画 (タスクトラッカー)

更新日: 2025-09-19 / 担当: AutoEDA Tech Lead

---

## 1. 現状サマリ

- バックエンド API (A1〜D1, C1/C2, S1) は実装済みで、メトリクスイベントも出力。
- Capability H（チャート生成：CH-01〜CH-21）は設計・ワイヤー・図・ドキュメントを反映済み（実装はこれから）。
- フロントは主要ページが実装済み。Storybook は導入済み（MSW/Router/Docs/A11y、VR運用まで整備）。
- テスト: pytest + Vitest + Playwright（Storybook VR）。Charts の代表ケースをVR対象に追加済み。
- CI: web ジョブで Lint/Type/Vitest/API検証/Storybook/VR まで実行。main 保護は有効、必須チェック contexts の確定が未了。
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
| T-UX-01 | ナビゲーション改善 | **TODO** | `App.tsx` | アクティブ表示 / Breadcrumbs |
| T-UI-01 | Storybook 導入/運用 | **Done** | `docs/storybook.md`, `.storybook/*` | MSW/Router/Docs/A11y 設定、VR連携、reduce motion/フォント/日時固定 |
| T-TEST-01 | API 単体テスト拡充 | **WIP** | `tests/python` | `test_upload.py` 追加、今後 `test_tools_profile.py` などを拡充 |
| T-TEST-02 | フロント UI テスト拡充 | **TODO** | `apps/web/src/tests` | Vitest + MSW でページごとのスナップショット |
| T-TEST-03 | Playwright シナリオ更新 | **TODO** | `tests/e2e` | Settings/Recipes/Leakage を包含する E2E |
| T-INF-01 | Docker サンドボックス | **TODO** | `infra/README.md` | `docker-compose.dev.yml` を作成し README の手順を実装 |
| T-INF-02 | GitHub Actions ワークフロー | **TODO** | `infra/ci/` (未作成) | lint/test/build の workflow_yml を作成 |
| T-DOC-01 | Storybook/Wireframe 同期 | **Done** | `docs/storybook.md`, `docs/wireframe.md` | 今後の UI 変更時に更新 |
| T-DOC-02 | 設計/要件同期 | **Done** | `docs/design.md`, `docs/requirements.md` | SLO/フォールバック値のモニタリング継続 |

### 2.1 Capability H（チャート生成：設計→実装）

| ID | スコープ | 状態 | リファレンス | 受け入れ基準/次アクション |
|----|----------|------|--------------|---------------------------|
| T-H0-00 | 基本設計・要件反映 | **Done** | `docs/requirements_v2.md`（CH-01〜21）, `docs/design.md` 3.6H, `docs/diagram.md`, `docs/wireframe.md` | 設計/図/ワイヤー/Storybook ガイド同期済み |
| T-H1-API | 単発生成API `/api/charts/generate` | **TODO** | `services/charts.py`（新規）, `orchestrator` JSON整形を再利用 | 200/4xx/5xx, timeout/mem/allowlist。ジョブ保存 `data/charts/<job_id>` |
| T-H1-FE | 「チャート作成」ボタン〜結果表示 | **TODO** | `ChartsPage` | 生成ステップUI、成功タブ（可視化/コード/メタ/DL）、エラー理由提示＋テンプレ/再試行 |
| T-H1-VR | Charts 単発 Story + VR | **Done(初期)** | `ChartsPage.stories.tsx`, `tests/storybook/charts.spec.ts` | ConsistentOnly/Empty のスナップショット（Linuxベースライン） |
| T-H2-API | 一括生成 `/api/charts/generate-batch` + ジョブ/バッチステータス | **TODO** | `services/charts.py`（キュー/並列度=ENV） | 並列度 cap=3 既定、部分成功、失敗個別再試行(最大3回) |
| T-H2-FE | 複数選択・一括生成バー/進捗 | **TODO** | `ChartsPage` | チェックボックス/全選択、N/M 進捗、失敗のみ再試行、キャンセル導線(P1) |
| T-HSEC | サンドボックス実行基盤 | **TODO** | `SandboxRunner`（新規） | NW遮断、時間≤10s、メモリ≤512MB、許可PKGのみ（pandas/numpy/altair/vega-lite/mpl） |
| T-HOBS | メトリクス/監視 | **TODO** | `metrics.record_event` | `Chart*` と `ChartBatch*` イベント、KPI（成功率/平均LT/失敗内訳/VR差分率） |

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
| T-CI-02 | 必須チェック contexts 追加 | **TODO** | GH API | `gh api` で `ci / web`（必要なら `ci / api`）を登録 |
| T-CI-03 | Storybook VR を継続運用 | **WIP** | `tests/storybook/*.spec.ts` | OS別ベースライン運用、差分閾値 0.01–0.03、レポート保全 |

---

## 3. 次のイテレーション候補

1. **H1（単発生成）**: `T-H1-API`, `T-H1-FE` を並行実装→Storybookで状態再現→VR対象へ追加。
2. **H2（一括生成）**: `T-H2-API`, `T-H2-FE` を実装。並列度=3 既定、失敗時の個別再試行・進捗UI。
3. **Sandbox**: `T-HSEC` を先行実装し、許可ライブラリ/timeout/mem を強制。安全に失敗する設計。
4. **CSV アップロード UI (T-U1-01)**: React Hook Form + `client-sdk`。413/422 のUXを整備。
5. **CI 固定**: `T-CI-02` で contexts 固定、VRレポート/アーティファクトの保存期間見直し。
6. **E2E 拡充 (T-TEST-03)**: Settings プロバイダ切替・Charts 成功/失敗・Recipes の一連シナリオ。

---

## 4. リスクとフォロー

- **LLM 未設定率が高い**: フォールバックが常態化しないよう、Settings での API Key 設定 UX を改善 (入力検証・成功トースト)。
- **データ持ち出し**: `data/datasets` が Git 管理外だがローカルに残る。クリーンアップスクリプトを検討。
- **テストカバレッジ**: LLM 呼び出しが直接 SDK 依存のため、API キー無し CI でも動作するモックを整備する必要あり。
 - **生成コードの安全性**: Sandbox の制限が不十分だとホスト影響リスク。最初から NW遮断/権限分離/FS隔離/timeout/mem を強制。
 - **VRのブレ**: OS/フォント差分で微小ノイズ。preview.ts でブレ抑制しつつ、差分閾値を最小限に設定。

---

## 5. 変更履歴

- 2025-09-19: Capability H を設計/図/ワイヤー/Storybookに反映。RAG/Gemini/EDA 安定化、Storybook VR 運用、Mermaid修正、タスク表を全面更新。
- 2025-09-18: バックエンド/フロント実装状況に合わせてタスク表を更新。Storybook/ワイヤーフレーム同期タスクを完了扱いに。
- 2025-09-15: 初版。
