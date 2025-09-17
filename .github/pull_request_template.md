### 目的
- 何を解決するか（1行）

### 変更点
- 箇条書きで

### 検証
- 再現手順 / 期待結果 / 実測ログやスクショ

### 影響範囲
- サービス/モジュール

### セキュリティ
- Secrets/PII 取扱い・マスクの有無

### チェックリスト（AGENTS.md）
- [ ] タイトル: `type(scope): subject`（Conventional Commits 1.0）
- [ ] Lint/Type/Unit/Integration すべて Green
- [ ] スキーマ整合（Zod↔OpenAPI）と NFR チェックを通過
- [ ] 変更点の要約・再現手順・リスク/影響範囲を本文に記載
- [ ] スナップショット更新は必要最小限
- [ ] CI 成功ログ or 実行ID を添付

