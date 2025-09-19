# AutoEDA Monorepo ガイド

AutoEDA は、探索的データ分析 (EDA) の定型作業を FastAPI と React で自動化するモノレポです。ローカル環境のみで完結することを前提に、CSV アップロードからプロファイル生成、チャート提案、根拠付き Q&A、次アクション優先度付け、PII/リークリスク検査、レシピ出力までを一連のストーリーとして提供します。LLM が未設定の場合はツール主導のフォールバックを行い、設定済みであれば OpenAI / Google Gemini のどちらかを動的に選択します。

## プロジェクト概要

- **バックエンド**: `apps/api` — FastAPI + Pydantic。`apps/api/services/*` にツール群・RAG・メトリクス・オーケストレーションを実装。
- **フロントエンド**: `apps/web` — React (Vite) + React Router。`packages/client-sdk` で API とスタブの両方を吸収。
- **共通スキーマ**: `packages/schemas` — Zod による型定義。API/フロント双方で共有。
- **観測/品質**: `apps/api/services/metrics.py` の軽量メトリクス、`apps/api/scripts/*.py` の SLO/RAG チェック。
- **ドキュメント**: `docs/` 配下に要件・設計・図・ストーリーボード・ワイヤーフレーム・タスクを整備。

## ディレクトリ構成

```
repo/
├─ apps/
│  ├─ api/                 # FastAPI アプリケーションとサービス層
│  └─ web/                 # React UI (Vite) とページコンポーネント
├─ packages/
│  ├─ client-sdk/          # フロント専用 SDK（フェッチ + フォールバック）
│  ├─ schemas/             # Zod スキーマ / 型エイリアス
│  └─ ui-kit/              # 軽量 UI コンポーネント（Button など）
├─ docs/                   # README 補完ドキュメント（要件・設計・図）
├─ services/               # 将来的なサービス分割（apps/api/services に集約済み）
├─ infra/                  # CI / Docker などインフラ設計ドキュメント
├─ scripts/                # スキーマ検証などの補助スクリプト
├─ tests/                  # pytest / Playwright / Vitest シナリオ
├─ config/                 # 認証情報サンプル (`credentials.example.json`)
├─ data/                   # 実行時に生成されるデータセット・レシピ・メトリクス
├─ dist/, test-results/    # ビルド成果物・E2E ログ（CI で生成）
└─ README.md               # 本ファイル
```

## 必要環境

- Node.js 20.x 系 (`actions/setup-node@v4` と同一レンジ)
- npm 10.x 以降
- Python 3.11 系 (`actions/setup-python@v5` と同一レンジ)
- Playwright 1.47 以降（E2E 実行時に `npx playwright install --with-deps`）
- `gh` CLI, `git`, Docker（任意。起動していない場合はメトリクスに影響なし）

## セットアップフロー

1. **Preflight** — ルール `docs/task.md` に従い下記を実行。

```bash
set -euo pipefail
git fetch --prune
gh auth status >/dev/null
git ls-remote --exit-code origin >/dev/null
if command -v docker >/dev/null 2>&1; then docker info >/dev/null 2>&1 || true; fi
```

2. **依存インストール**

```bash
npm install
pip install -r apps/api/requirements.txt
npx playwright install --with-deps
```

3. **開発サーバー起動**

```bash
npm run dev:web                      # Vite 開発サーバー (http://localhost:5173)
uvicorn apps.api.main:app --reload   # FastAPI (http://localhost:8000)
```

`apps/web` は `import.meta.env.VITE_API_BASE` を参照します。API を別ポートで動かす場合は `apps/web/.env.local` に `VITE_API_BASE=http://localhost:8000` を設定してください。

既定モデル（環境変数で上書き可能）:

- Gemini: `AUTOEDA_GEMINI_MODEL`（デフォルト: `gemini-2.5-flash`）
- OpenAI: `AUTOEDA_LLM_MODEL`（デフォルト: `gpt-5-nano`）

## LLM 資格情報の取り扱い

- `config/credentials.example.json` を複製して `config/credentials.json` を作成します。
- `llm.provider` で `openai` / `gemini` を指定、各 API Key を設定します。
- Git にはコミットされません。CI では `AUTOEDA_CREDENTIALS_FILE` 環境変数で JSON のパスを指示できます。
- フロントエンドの `Settings` 画面 (`/settings`) からも `POST /api/credentials/llm` を通じて更新可能です。
- 未設定の場合は LLM 呼び出しをスキップし、`tool:` で始まる参照を付与したフォールバック応答を返します。

## データ / アーティファクト保管場所

| 種別 | パス | 説明 |
| ---- | ---- | ---- |
| データセット | `data/datasets/*.csv` | `POST /api/datasets/upload` で保存。`.meta.json` に PII / リークの状態を記録 |
| レシピ | `data/recipes/<dataset_id>/` | `recipe.json` / `eda.ipynb` / `sampling.sql` を生成 |
| メトリクス | `data/metrics/events.jsonl` | `apps/api/services/metrics.py` が JSON Lines で追記。`python3 apps/api/scripts/check_slo.py` が参照 |

ランタイム生成のため Git には含めません。再現が必要な場合はアーティファクトを手動で保全してください。

## 品質ゲートとテスト

| コマンド | 目的 |
| -------- | ---- |
| `npm run lint:web` | フロントエンドの ESLint |
| `npm run typecheck:web` | TypeScript 型チェック |
| `npm run test:web` | Vitest による単体/統合テスト |
| `PYTHONPATH=. pytest tests/python` | FastAPI サービスの pytest |
| `npx playwright test` | E2E 受け入れテスト（A2/B1/B2/C1/C2/D1 シナリオ） |
| `npm run schema:validate` | `packages/schemas` と OpenAPI の整合性検証 (`scripts/validate_schemas.ts`) |
| `python3 apps/api/scripts/check_slo.py` | メトリクスイベントから SLO 違反を検出 |
| `python3 apps/api/scripts/check_rag.py` | RAG ゴールデンセットの網羅率チェック |
| `python3 apps/api/scripts/merge_quality_reports.py` | 各種レポートを `reports/quality_summary.json` に統合 |

CI では push 時に同等のチェックが実行される想定です。

## API エンドポイント概要

| メソッド / パス | 用途 | 実装 | 備考 |
| --------------- | ---- | ---- | ---- |
| `GET /health` | ライブネス確認 | `apps/api/main.py:78` | 200/`{"status":"ok"}` |
| `POST /api/datasets/upload` | CSV アップロード | `apps/api/main.py:95` (`tools.save_dataset`) | 100MB, 50列まで。`data/datasets` に保存 |
| `GET /api/datasets` | データセット一覧 | `apps/api/main.py:109` (`storage.list_datasets`) | メタデータ JSON を返す |
| `POST /api/eda` | A1 レポート生成 | `apps/api/main.py:116` (`orchestrator.generate_eda_report`) | LLM 未設定時はツール要約フォールバック |
| `POST /api/charts/suggest` | A2 チャート提案 | `apps/api/main.py:138` (`tools.chart_api` + `evaluator.consistency_ok`) | `consistency_score>=0.95` のみ |
| `POST /api/qna` | B1 根拠付き回答 | `apps/api/main.py:151` (`tools.stats_qna`) | `coverage>=0.8` を保証 |
| `POST /api/followup` | 追質問回答 | `apps/api/main.py:164` (`tools.followup`) | 追質問向けテンプレート |
| `POST /api/actions/prioritize` | B2 次アクション優先度付け | `apps/api/main.py:182` (`tools.prioritize_actions`) | WSJF / RICE スコアを付与 |
| `POST /api/pii/scan` | C1 PII 検出 | `apps/api/main.py:193` (`tools.pii_scan`) | 正規表現 + pandas による簡易検出 |
| `POST /api/pii/apply` | PII ポリシー適用 | `apps/api/main.py:200` (`tools.apply_pii_policy`) | `data/datasets/*.meta.json` を更新 |
| `POST /api/leakage/scan` | C2 リーク検査 | `apps/api/main.py:211` (`tools.leakage_scan`) | `rules_matched` を含む |
| `POST /api/leakage/resolve` | リーク対応状態更新 | `apps/api/main.py:218` (`tools.resolve_leakage`) | exclude / acknowledge / reset |
| `POST /api/recipes/emit` | D1 レシピ生成 | `apps/api/main.py:229` (`tools.recipe_emit`) | 生成物のハッシュと再現統計を返す |
| `GET /api/credentials/llm` | LLM 状態取得 | `apps/api/main.py:242` (`config`) | 選択中プロバイダと設定状況 |
| `POST /api/credentials/llm` | LLM 資格情報更新 | `apps/api/main.py:250` | `config/credentials.json` を更新 |

各エンドポイントの詳細サンプルは `apps/api/README.md` を参照してください。

## 参照ドキュメント

- `docs/requirements.md` — ストーリー / 受入れ基準 / 観測イベント
- `docs/design.md` — アーキテクチャ設計・データフロー・フォールバック方針
- `docs/diagram.md` — サイトマップ・画面遷移・状態遷移図
- `docs/wireframe.md` — 現行 UI の Lo-Fi ワイヤーフレーム
- `docs/storybook.md` — UI コンポーネント / Storybook 設計方針
- `docs/task.md` — WBS / 実装状況と次アクション
- `apps/api/README.md` — FastAPI サービスの開発手順
- `infra/README.md` — CI / Docker 等インフラ計画
- `services/README.md` — サービス層モジュールの責務一覧

これらを順守し、最小差分での継続的改善と CI Green を維持してください。
