# infra/

AutoEDA のインフラ・CI 設計メモ。現時点ではコード実装は未着手で、ドキュメントとして計画を共有する。

---

## 1. 現状

- Docker / Compose ファイルは未作成。ローカル開発はホスト環境で実施している。
- GitHub Actions のワークフローは未登録。手動で `npm` / `pytest` / `playwright` を実行している。
- `docs/design.md` で参照しているサンドボックスイメージ (`ghcr.io/your-org/codex-sbx:py3.12-node22-2025.09`) は未発行。

---

## 2. TODO (優先度順)

1. **Docker サンドボックス (T-INF-01)**
   - 目的: Node 20 + Python 3.11 + Playwright + pandas 等を同梱した開発用環境。
   - 作業指針:
     - `infra/docker/Dockerfile.dev` を作成し、`pip install -r apps/api/requirements.txt` / `npm install` を実行。
     - `docker-compose.dev.yml` で `web` (Vite) と `api` (FastAPI) をまとめて起動。
     - `.env.example` に `AUTOEDA_CREDENTIALS_FILE` など必要な環境変数を追記。

2. **GitHub Actions ワークフロー (T-INF-02)**
   - 目的: push/pr 時に lint/typecheck/test/SLO を自動実行。
   - 作業指針:
     - `infra/ci/main.yml` を作成 (`uses: actions/setup-node@v4`, `actions/setup-python@v5`).
     - 以下のジョブを作成: `lint-web`, `test-web`, `pytest-api`, `playwright`, `slo-check`。
     - LLM 資格情報は不要 (フォールバックでテスト可能)。

3. **アーティファクト保存**
   - Playwright のスクリーンショット/動画 (`test-results/`) を GitHub Actions のアーティファクトとしてアップロード。
   - `data/metrics/events.jsonl` を CI 中で参照する場合は `RUNNER_TEMP` に生成。

4. **セキュリティ/Secrets 設定**
   - `AUTOEDA_CREDENTIALS_FILE` を CI で指定する場合は `GH_TOKEN` とは別に暗号化シークレットとして保管。
   - PII を含むファイルをアップロードしないよう PR チェックを追加。

---

## 3. 参考

- `docs/task.md` T-INF-01/T-INF-02 を参照。
- GitHub Actions への統合後は README とこのファイルを更新し、実際のコマンド例を記載すること。
