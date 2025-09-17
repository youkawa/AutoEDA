# AutoEDA Monorepo ガイド

本プロジェクトは、CSV 等の表形式データに対する EDA（探索的データ分析）をエンドツーエンドで自動化するモノレポです。RAG（Retrieval-Augmented Generation）とツール連携を組み合わせ、プロファイリングからチャート提案、Q&A、次アクション、PII/リーク検査、再現レシピ生成までを一気通貫で提供します。

## プロジェクト構成概要

```
repo/
├─ apps/
│  ├─ api/                # FastAPI ベースのバックエンド（/api/*）
│  └─ web/                # React (Vite) フロントエンド
├─ packages/
│  ├─ client-sdk/         # Web/API 双方で利用する SDK
│  ├─ schemas/            # 共通スキーマ（Zod）
│  └─ ui-kit/             # UI コンポーネント
├─ docs/                  # 要件・設計・図面
├─ tests/
│  ├─ python/             # Pytest ベースの API/ツール単体テスト
│  └─ e2e/                # Playwright 受け入れシナリオ
└─ reports/               # CI で生成される QA レポート（SLO/RAG/Playwright）
```

主要ストーリーとエンドポイント：

| Story | 目的 | 主なエンドポイント | 受入条件（例） |
|-------|------|-------------------|----------------|
| A1 | プロファイリング | `POST /api/eda` | p95 ≤ 10s, groundedness ≥ 0.9, 引用被覆率 ≥ 0.8 |
| A2 | チャート自動提案 | `POST /api/charts/suggest` | 上位 5 件、説明と統計の一致率 ≥ 0.95 |
| B1 | 根拠付き Q&A | `POST /api/qna` | 数値はツール出力、引用被覆率 ≥ 0.8 |
| B2 | 次アクション優先度付け | `POST /api/actions/prioritize` | WSJF/RICE 指標を添えて提示 |
| C1 | PII 検査とマスキング | `POST /api/pii/scan` / `apply` | 検出フィールド・ポリシーを表示し再計算 |
| C2 | リークリスク検査 | `POST /api/leakage/scan` / `resolve` | フラグ列と除外/承認操作 |
| D1 | 再現レシピ生成 | `POST /api/recipes/emit` | `recipe.json` 等を生成し主要統計 ±1% 再現 |

## 環境セットアップ

### 前提ソフトウェア

- Node.js 20.x（`actions/setup-node@v4` 基準）
- npm 10.x 以降
- Python 3.11（`actions/setup-python@v5` 基準）
- Playwright 1.47 以降（CLI は `npx playwright` で自動インストール可能）

### 初期準備

#### 資格情報の設定

LLM 連携を行う場合は、以下の手順で OpenAI API Key を登録します。

1. `config/credentials.example.json` をコピーして `config/credentials.json` を作成。
2. `"llm.openai_api_key"` に実際のキーを設定。
3. CI や別環境でファイルパスを切り替える場合は、環境変数 `AUTOEDA_CREDENTIALS_FILE` で JSON のパスを指定。

```bash
cp config/credentials.example.json config/credentials.json
$EDITOR config/credentials.json  # <REPLACE_WITH_REAL_KEY> を更新
```

`config/credentials.json` は `.gitignore` に登録済みのため、実際のキーをコミットする心配はありません（リポジトリ外へ持ち出す場合は手動で保護してください）。

```jsonc
// config/credentials.json の最小構成例
{
  "llm": {
    "openai_api_key": "sk-..."
  }
}
```

ローカル以外の環境では、ファイルパスを環境変数で明示することで同一コードを再利用できます。

```bash
# 例: GitHub Actions で secrets から生成する場合
echo "${{ secrets.AUTOEDA_OPENAI_KEY_JSON }}" > $RUNNER_TEMP/autoeda_credentials.json
export AUTOEDA_CREDENTIALS_FILE="$RUNNER_TEMP/autoeda_credentials.json"
python -m pytest tests/python
```

> LLM キーを未設定のままにすると、オーケストレータはフォールバック動作となり、LLM を利用するテスト (`tests/python/test_orchestrator.py` など) は失敗します。E2E や API 実行でも LLM 結果が欠落するため、必ず設定してください。

#### Web UI の API 接続設定

Web UI（Vite）は `import.meta.env.VITE_API_BASE` を参照してバックエンドのベース URL を決定します。既定値は空文字（同一オリジン）ですが、開発時は FastAPI を別ポート（例: 8000 番）で起動するため、以下のいずれかを設定してください。

- リバースプロキシを構成し、`/api/*` を http://localhost:8000 に透過転送する
- または `apps/web/.env.local`（もしくは `.env`）で `VITE_API_BASE` を指定する

```bash
cat <<'EOF' > apps/web/.env.local
VITE_API_BASE=http://localhost:8000
EOF
```

`.env.local` はコミット対象外です。設定後、Web UI からの `fetch('/api/...')` は `http://localhost:8000/api/...` へルーティングされます。

```bash
# 依存関係インストール
npm install

# Python 依存（バックエンド用）
pip install -r apps/api/requirements.txt

# Playwright ブラウザを導入（E2E 実行時に一度だけ）
npx playwright install --with-deps
```

事前に `.env` 等の機密情報は不要です。モック／フォールバックが組み込まれているため、ローカルのみで動作します。

## クイックスタート

### API & Web の同時開発

```bash
# フロントエンドの開発サーバー (Vite)
npm run -w @autoeda/web dev

# API 側の起動（例：uvicorn）
cd apps/api
uvicorn main:app --reload
```

上記の起動後にアクセスする URL と役割は次の通りです。

- Web UI: http://localhost:5173 — データセット選択から解析結果・Q&A・レシピ出力までを操作する SPA
- API: http://localhost:8000 — Web UI から呼ばれる FastAPI （`/api/*` エンドポイント）

ブラウザで http://localhost:5173 を開き、サイドメニューからストーリー別の画面を操作できます。UI 上のリクエストは `VITE_API_BASE` で指定した API に送信されます（未設定の場合は同一オリジンに送信されるため注意）。

OpenAI API Key は http://localhost:5173/settings の「Settings」画面から入力して登録することもできます（内部的には `config/credentials.json` に保存されます）。ローカルでの初回セットアップ時はこの画面を利用すると差し替えが容易です。

### テストスイート

| コマンド | 内容 |
|----------|------|
| `npm run -w @autoeda/web lint` | ESLint チェック（web） |
| `npm run -w @autoeda/web test` | Vitest（React 単体・統合テスト） |
| `PYTHONPATH=. pytest tests/python` | Pytest による API/ツール単体テスト |
| `npx playwright test` | 受け入れテスト（A2/B1/B2/C1/C2/D1 シナリオをカバー） |
| `npm run check:slo` | メトリクスログを解析し SLO 違反を検出（JSON レポート出力可） |
| `npm run check:rag` | RAG ゴールデンセットを評価（missing クエリがあればエラー） |
| `npm run report:merge` | SLO/RAG レポートを統合し `reports/quality_summary.json` を生成 |

> `pytest` / `playwright test` など LLM を利用するテストを実行する前に、必ず前述の `config/credentials.json` を作成するか `AUTOEDA_CREDENTIALS_FILE` を指しておいてください。

### 受け入れテストのシナリオ概要

`tests/e2e/acceptance.spec.ts` では以下を検証します。

- **A2**: 「可視化を自動提案」画面で consistency score と根拠表示を確認。
- **B1**: Q&A 実行後に引用被覆率が表示されること。
- **C1**: PII スキャンで検出フィールドが表示され、マスク適用後に適用済みリストが更新されること。
- **B2**: Next Actions でフォールバック警告と引用ビューが提示されること。
- **C2**: リークリスク画面でフラグ列が表示され、除外操作が可能であること。
- **D1**: Recipes 画面でアーティファクト情報と引用ビューを確認し、統計ビューが ±1% 以内で再現されること（フォールバック時は警告を表示）。

## 使用方法（API）

バックエンド API は FastAPI により `/api/*` エンドポイントを提供します。例として、`/api/eda` でプロファイルを取得するには以下のようなリクエストを送信します。

```bash
curl -X POST http://localhost:8000/api/eda \
  -H 'Content-Type: application/json' \
  -d '{
        "dataset_id": "sales.csv",
        "sample_ratio": 0.3
      }'
```

レスポンスには `summary`, `distributions`, `key_features`, `outliers`, `data_quality_report`, `next_actions`, `references` を含む JSON が返却されます。返却値は `apps/api/main.py` の Pydantic モデルをご参照ください。

## QA／監視レポート

CI ワークフロー（`.github/workflows/ci.yml`）では以下の順で品質検証を実施し、結果をアーティファクト `qa-reports` と `playwright-report` に保存します。

1. ESLint / Typecheck / Vitest / Pytest / Playwright
2. OpenAPI スキーマ差分検出
3. `npm run check:slo`（SLO 監視）
4. `npm run check:rag`（RAG ゴールデンセット評価）
5. `npm run report:merge` で SLO/RAG レポートを統合
6. Playwright HTML レポート出力

ローカルで JSON レポートを保存するには環境変数を利用します。

```bash
AUTOEDA_SLO_OUTPUT=reports/slo_report.json npm run check:slo
AUTOEDA_RAG_OUTPUT=reports/rag_report.json npm run check:rag
AUTOEDA_QA_SUMMARY=reports/summary.json npm run report:merge
```

## 仕様サマリ

- **設計ドキュメント**: `docs/design.md`
- **ユースケース／WBS**: `docs/task.md`
- **画面遷移図**: `docs/diagram.md`
- **要件定義**: `docs/requirements.md`

### 非機能要求（抜粋）

- A1 p95 レイテンシ ≤ 10s、groundedness ≥ 0.9、引用被覆率 ≥ 0.8
- A2 チャート説明一致率 ≥ 0.95、応答 p95 ≤ 6s
- B1 Q&A 引用被覆率 ≥ 0.8、応答 p95 ≤ 4s
- C1 PII 検出再現率 ≥ 0.95、誤検知 ≤ 0.05
- C2 リーク検出率 ≥ 0.9、誤警告 ≤ 0.1
- D1 レシピ主要統計 ±1% 再現、依存リスト同梱

### フォールバック設計

LLM 連携が失敗した場合でも、ツール出力のみによる安全なレスポンスを返却します。UI では「LLMフォールバック: ツール要約のみ表示中」バナーを表示し、引用ビューで根拠（`tool:*`）を提示します。

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| Playwright テストが 404 になる | `npm run -w @autoeda/web dev`／API サーバーの起動を確認。Mock データは `packages/client-sdk` が提供。 |
| RAG 調査で missing が出る | `docs/requirements.md` / `docs/design.md` に追記された新要件を `docs/rag_golden.json` に追加し、`check_rag.py` を更新。 |
| SLO レポートが空 | `data/metrics/events.jsonl` にイベントが記録されているか（API コール時に `log_event` が標準出力へ出る）。ローカルで検証する際は環境変数 `AUTOEDA_SLO_OUTPUT` を指定してからテスト実行。 |

## 今後の拡張候補

- Playwright レポートの自動公開（PR コメント・Slack 通知）
- Recipes 再現統計の安定的な検証のためのモック整備
- RAG ゴールデンセットの拡大とナイトリー検証

---

本 README は 2025-09-17 時点の `fix/openapi-snapshot-update` ブランチに基づいています。最新情報は CI ログおよび `docs/` ディレクトリを参照してください。
