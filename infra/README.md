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
   - 実装: `infra/docker/Dockerfile.dev`, `docker-compose.dev.yml`, `.dockerignore` を追加。
   - 起動手順:
     ```sh
     docker compose -f docker-compose.dev.yml up --build
     # Web: http://localhost:5173  API: http://localhost:8000
     ```
   - 備考: 依存のインストールはコンテナ起動時コマンドで実行（bind mountで高速化）。

2. **GitHub Actions ワークフロー (T-INF-02)**
   - 目的: push/pr 時に lint/typecheck/test/SLO を自動実行。
   - 実装状況: `.github/workflows/ci.yml` に統合（Lint/Type/Vitest/OpenAPI/Playwright/VR/SLO）。

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
