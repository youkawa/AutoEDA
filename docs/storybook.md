# AutoEDA Storybook 設計ノート (プロトタイプ)

> 目的: `apps/web` の UI を Storybook で再現し、A1〜D1/C1/C2/S1 のストーリーをコンポーネント単位で検証できるようにする。現状はまだ Storybook を導入していないため、既存コンポーネントの棚卸しと導入計画をまとめる。

---

## 1. 現状サマリ（2025-09-18 リファクタ後）

- UI は Tailwind ベースに統一し、`AppLayout` + `SideNav` + `TopBar` の構造に刷新。
- 共通 UI は `@autoeda/ui-kit` の強化済み `Button` と、`apps/web/src/components/ui/Card` などの再利用コンポーネントで構成。
- ページは `LastDatasetProvider` 経由で状態を共有しつつ、カードレイアウトやグラデーションヒーローなどを採用。
- API 呼び出しは引き続き `packages/client-sdk` に集約されており、MSW や Storybook のモックが容易。

Storybook では以下 4 層で管理する方針とする:

1. **Foundations** (`packages/ui-kit`, `apps/web/src/index.css`) — Button, カラー/タイポグラフィ。
2. **Layout** (`AppLayout`, `SideNav`, `TopBar`) — ナビゲーションやレスポンシブハンドリングを担うコンテナ。
3. **UI Blocks** (`Card`, `MetricPill` など) — ページ内で組み合わせるブロック単位。
4. **Page Containers** (`apps/web/src/pages/*.tsx`) — Storybook では React Router + MSW を用いてフルページ状態を再現。

---

## 2. コンポーネント在庫 (2025-09-18 UI リニューアル版)

| レベル | 名称 | ファイル | 主な役割 |
| ------ | ---- | -------- | -------- |
| Foundation | `Button` | `packages/ui-kit/src/index.tsx` | variant/size/loading/icon を持つ共通ボタン |
| Foundation | `Card*` | `apps/web/src/components/ui/Card.tsx` | ラウンド角 + シャドウ付きカードの共通ラッパー |
| Layout | `AppLayout` | `apps/web/src/components/layout/AppLayout.tsx` | サイドナビ + トップバー + Responsive タブ |
| Layout | `SideNav` | `apps/web/src/components/navigation/SideNav.tsx` | ルート別のナビゲーションとアイコン表示 |
| Layout | `TopBar` | `apps/web/src/components/layout/TopBar.tsx` | ページタイトル、ヘルプ/設定ボタン、検索バー |
| Context | `LastDatasetProvider` | `apps/web/src/contexts/LastDatasetContext.tsx` | 最近操作したデータセット ID/名称を共有 |
| Page | `HomePage` | `apps/web/src/pages/HomePage.tsx` | グラデーションヒーロー + 機能ハイライトカード |
| Page | `DatasetsPage` | 同上 | テーブル表示 + サマリー統計 + CTA |
| Page | `EdaPage` | 同上 | メトリックカード / 品質カード / 分布ハイライト / 引用切替 |
| Page | `ChartsPage` | 同上 | チャートカード (信頼度バッジ) + フィルタ切替 |
| Page | `QnaPage` | 同上 | 質問フォーム + サジェスト + 回答/引用ビュー |
| Page | `ActionsPage` | 同上 | WSJF/RICE カード + MetricPill + ビュー切替 |
| Page | `PiiPage` | 同上 | ポリシーカード + 適用済みステータス表示 |
| Page | `LeakagePage` | 同上 | ルール別フラグ + 除外/承認/リセット CTA |
| Page | `RecipesPage` | 同上 | アーティファクトハッシュ / 再現統計差分 / 引用ビュー |
| Page | `SettingsPage` | 同上 | プロバイダステータス + API Key フォーム |

---

## 3. Storybook 導入計画

1. `packages/ui-kit` に Storybook をセットアップ (`npx storybook@latest init --builder vite`)。
2. `apps/web/.storybook/main.ts` を追加し、パスエイリアス (`@autoeda/...`) を Vite 設定と揃える。
3. MSW を利用し `client-sdk` の Fetch をモック。標準フォールバックをそのまま利用する場合は `client-sdk` のメソッドをスタブ化。
4. 優先ストーリー (推奨):
   1. **Foundations** — `Button` (variant/size/loading) + `Card`.
   2. **Layout** — `AppLayout` を `reactRouter` addon と組み合わせ、サイドナビ動作を確認。
   3. **Pages** — 各ページで「標準」「LLM フォールバック」「データ無し」など複数状態を用意。
      - `HomePage`: default / lastDataset あり。
      - `DatasetsPage`: empty / populated。
      - `EdaPage`: normal / fallback / loading。
      - `ChartsPage`: consistentOnly true/false。
      - `QnaPage`: 未回答 / 回答済み。
      - `ActionsPage`: fallback true/false。
      - `PiiPage`: 検出あり/なし。
      - `LeakagePage`: flagged/none。
      - `RecipesPage`: tolerance OK/NG。
      - `SettingsPage`: OpenAI 設定済み / Gemini 設定済み / 未設定。

---

## 4. サンプル Story スニペット

```tsx
// apps/web/src/pages/EdaPage.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { EdaPage } from './EdaPage';
import { AppLayout } from '../components/layout/AppLayout';
import { LastDatasetProvider } from '../contexts/LastDatasetContext';
import { rest } from 'msw';

const meta: Meta<typeof EdaPage> = {
  title: 'Pages/EDA/Overview',
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/eda/ds_mock']}>
        <LastDatasetProvider>
          <AppLayout />
          <Story />
        </LastDatasetProvider>
      </MemoryRouter>
    ),
  ],
  parameters: {
    reactRouter: {
      routePath: '/eda/:datasetId',
      routeParams: { datasetId: 'ds_mock' },
    },
    msw: {
      handlers: [
        rest.post('/api/eda', (_req, res, ctx) => {
          return res(ctx.status(200), ctx.json({
            summary: { rows: 1000, cols: 20, missing_rate: 0.12, type_mix: { int: 8, float: 4, cat: 8 } },
            distributions: [],
            key_features: ['価格と割引率が高い相関'],
            outliers: [],
            data_quality_report: { issues: [] },
            next_actions: [],
            references: [{ kind: 'doc', locator: 'policy:pii' }],
          }));
        }),
      ],
    },
  },
};

export default meta;
export default meta;

type Story = StoryObj<typeof EdaPage>;

export const Default: Story = {};
export const Fallback: Story = {
  parameters: {
    msw: {
      handlers: [
        rest.post('/api/eda', (_req, res, ctx) => {
          return res(ctx.status(200), ctx.json({
            summary: { rows: 1000, cols: 20, missing_rate: 0.12, type_mix: { int: 8, float: 4, cat: 8 } },
            distributions: [],
            key_features: [],
            outliers: [],
            data_quality_report: { issues: [] },
            next_actions: [],
            references: [{ kind: 'doc', locator: 'tool:fallback' }],
          }));
        }),
      ],
    },
  },
};
```

---

## 5. カバレッジマトリクス (Story ↔ 要件)

| ストーリー | 充足コンポーネント | Storybook ステータス |
| ---------- | ---------------- | -------------------- |
| A1 (EDA Summary) | `EdaPage` + `AppLayout` | `Default`, `Fallback`, `Loading` |
| A2 (Charts) | `ChartsPage` | `AllCharts`, `ConsistentOnly` |
| B1 (Q&A) | `QnaPage` | `Idle`, `Answered` |
| B2 (Next Actions) | `ActionsPage` | `Standard`, `Fallback` |
| C1 (PII) | `PiiPage` | `Detected`, `None` |
| C2 (Leakage) | `LeakagePage` | `Flagged`, `Resolved` |
| D1 (Recipes) | `RecipesPage` | `WithinTolerance`, `ToleranceExceeded` |
| S1 (LLM Credentials) | `SettingsPage` | `OpenAIConfigured`, `GeminiConfigured`, `Unconfigured` |

---

## 6. 実装指針

- Story では `client-sdk` を直接呼ばず、MSW で HTTP レイヤーをモックすることで実運用に近い挙動を再現する。
- 戻り値のスキーマは `packages/schemas` から import し、型安全なモックを生成する。
- フォールバックメッセージ (例: `tool:` プレフィックス) を切り替えられるよう、Story args で `references` を差し替える。
- UI キット拡充時は Atomic Design に再整理し、本ファイルの在庫表を随時更新する。
- `AppLayout` 系の Story では `MemoryRouter` + `reactRouter` addon を併用し、ナビゲーションの挙動を再現する。

Storybook 導入後は CI でビルドを実施し、主要ページのスクリーンショット回帰テスト (Playwright + Storybook) も検討する。
