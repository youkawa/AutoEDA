# AutoEDA 実装計画 (タスクトラッカー)

更新日: 2025-09-18 / 担当: AutoEDA Tech Lead

---

## 1. 現状サマリ

- バックエンド API (A1〜D1, C1/C2, S1) は実装済みで、メトリクスイベントも出力される。
- フロントエンドは各ページを実装済み。ただし CSV アップロード UI と Storybook は未着手。
- テストは python 単体 + Vitest を部分的に整備済み。MSW/Storybook/E2E の拡充が必要。
- インフラ (Docker, CI ワークフロー) は設計ドキュメントのみ。GitHub Actions 連携は `infra/README.md` に記載の TODO。

---

## 2. タスク一覧

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
| T-U1-01 | CSV アップロード UI | **TODO** | API は `apps/api/main.py:95` | `Home` にアップロードフォーム。`client-sdk` へ `upload` を追加 |
| T-UX-01 | ナビゲーション改善 | **TODO** | `App.tsx` | アクティブ表示 / Breadcrumbs |
| T-UI-01 | Storybook 導入 | **TODO** | `docs/storybook.md` | `npx storybook@latest init` + MSW モック |
| T-TEST-01 | API 単体テスト拡充 | **WIP** | `tests/python` | `test_tools_profile.py` 追加、LLM フォールバックパスを検証 |
| T-TEST-02 | フロント UI テスト拡充 | **TODO** | `apps/web/src/tests` | Vitest + MSW でページごとのスナップショット |
| T-TEST-03 | Playwright シナリオ更新 | **TODO** | `tests/e2e` | Settings/Recipes/Leakage を包含する E2E |
| T-INF-01 | Docker サンドボックス | **TODO** | `infra/README.md` | `docker-compose.dev.yml` を作成し README の手順を実装 |
| T-INF-02 | GitHub Actions ワークフロー | **TODO** | `infra/ci/` (未作成) | lint/test/build の workflow_yml を作成 |
| T-DOC-01 | Storybook/Wireframe 同期 | **Done** | `docs/storybook.md`, `docs/wireframe.md` | 今後の UI 変更時に更新 |
| T-DOC-02 | 設計/要件同期 | **Done** | `docs/design.md`, `docs/requirements.md` | SLO/フォールバック値のモニタリング継続 |

---

## 3. 次のイテレーション候補

1. **CSV アップロード UI (T-U1-01)** — React Hook Form + `client-sdk` で実装。サイズ制限のエラーハンドリングを考慮。
2. **Storybook + Visual Regression (T-UI-01)** — MSW を組み合わせ、LLM フォールバックを含む状態を再現可能にする。
3. **Docker 化 (T-INF-01)** — `ghcr.io/your-org/codex-sbx:py3.12-node22-2025.09` をベースに Compose ファイルを追加し、README の手順を実際に動かす。
4. **テスト拡充 (T-TEST-01〜03)** — pytest/Vitest/Playwright を CI に統合。SLO チェックを `npm test` 後に連携。

---

## 4. リスクとフォロー

- **LLM 未設定率が高い**: フォールバックが常態化しないよう、Settings での API Key 設定 UX を改善 (入力検証・成功トースト)。
- **データ持ち出し**: `data/datasets` が Git 管理外だがローカルに残る。クリーンアップスクリプトを検討。
- **テストカバレッジ**: LLM 呼び出しが直接 SDK 依存のため、API キー無し CI でも動作するモックを整備する必要あり。

---

## 5. 変更履歴

- 2025-09-18: バックエンド/フロント実装状況に合わせてタスク表を更新。Storybook/ワイヤーフレーム同期タスクを完了扱いに。
- 2025-09-15: 初版。
