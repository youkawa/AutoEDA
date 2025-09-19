# AutoEDA Storybook 運用ガイド（2025-09-19）

目的
- `apps/web` の UI を Storybook で再現し、A1〜D1/C1/C2/S1 と Capability H（チャート生成：CH-01〜CH-21）を安全・再現可能に検証する。
- CI に Storybook build と Playwright のビジュアルリグレッション（VR）を組み込み、UI崩れを自動検知する。

前提
- Storybook 9（react-vite）を採用。MSW と React Router のアドオンでページ状態を再現。
- 既存ストーリーと Docs(MDX) を活用し、Foundations/UI Blocks/Layout/Page の4層で管理。

既存セットアップ（抜粋）
- 依存（apps/web/package.json）:
  - `@storybook/react-vite@^9.1.6`, `@storybook/addon-docs`, `@storybook/addon-a11y`
  - `msw@^2`, `msw-storybook-addon@^2.0.5`
  - `storybook-addon-react-router-v6@^2.0.15`
- 代表ストーリー/Docs:
  - UI: `Button.stories.tsx`, `Card.stories.tsx`, `Pill.stories.tsx`, `StatCard.stories.tsx`, `Toast.stories.tsx`
  - Docs(MDX): `Pill.docs.mdx`, `StatCard.docs.mdx`, `Toast.docs.mdx`
  - Layout/Page: `AppLayout.stories.tsx`, `PiiPage.stories.tsx`, `LeakagePage.stories.tsx`

---

## 1. ディレクトリと基本設定

構成（apps/web）
- `.storybook/main.ts`（フレームワーク/アドオン設定）
- `.storybook/preview.ts`（decorators: MSW/Router、全体パラメータ、reduce motion）
- `src/components/**.stories.tsx|.docs.mdx`（UI/Docs）
- `src/pages/**.stories.tsx`（Page再現：MSW+Router）
- `src/tests/msw/{handlers.ts, server.ts}`（APIモックを再利用）

main.ts（例）
```ts
import type { StorybookConfig } from '@storybook/react-vite';
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.docs.mdx'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    'msw-storybook-addon',
    'storybook-addon-react-router-v6',
  ],
};
export default config;
```

preview.ts（例）
```ts
import { initialize, mswDecorator } from 'msw-storybook-addon';
import { withRouter } from 'storybook-addon-react-router-v6';

initialize({ onUnhandledRequest: 'bypass' });
export const decorators = [withRouter, mswDecorator];
export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: { expanded: true },
  a11y: { disable: false },
};

// Reduce motion for deterministic VR
const style = document.createElement('style');
style.innerHTML = '*{animation: none !important; transition: none !important;}';
document.head.appendChild(style);
```

---

## 2. ストーリー作法（Foundations → Page）

Foundations（UI Kit / Blocks）
- アトミックに props/variants を列挙（argTypes/controls）。
- Docs(MDX) を併設し、デザイン指針とアクセシビリティを明文化。

Layout/Page
- ルーティングは `MemoryRouter` または `withRouter` を利用。初期URLは `initialEntries` で制御。
- API は MSW ハンドラで再現。成功系/空データ/エラーを `parameters.msw.handlers` で切替。

例: Page ストーリー（抜粋）
```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { EdaPage } from '../pages/EdaPage';

const meta: Meta<typeof EdaPage> = {
  title: 'Pages/EdaPage',
  component: EdaPage,
  parameters: {
    msw: { handlers: [http.post('/api/eda', () => HttpResponse.json(/* mocked */))] },
  },
};
export default meta;

export const Default: StoryObj<typeof EdaPage> = {
  render: () => (
    <MemoryRouter initialEntries={["/eda/ds_001"]}>
      <EdaPage />
    </MemoryRouter>
  ),
};
```

---

## 3. Visual Regression（VR）運用（Playwright）

目的
- Storybook を静的ビルドし、Playwright で代表ストーリーを撮影→差分検知。

方針
- OS別にベースラインを保持（`*-linux.png`, `*-darwin.png`）。CI（Linux）は初回ランで自動生成、次回以降で比較。
- 微小差分は `maxDiffPixelRatio` 0.01–0.03 で許容。モーションは `preview.ts` で抑止。
- 待機は role/aria で安定化（例: `[aria-label="loading"]` の消失待ち）。

例: Playwright テスト（概念）
```ts
import { test, expect } from '@playwright/test';

test('Pill tone variants', async ({ page }) => {
  await page.goto('http://localhost:6006/iframe.html?id=components-pill--tone-variants');
  await expect(page.locator('body')).toHaveScreenshot('pill-tone-variants-linux.png', {
    maxDiffPixelRatio: 0.02,
  });
});
```

命名規約
- `story-id-scenario-<os>.png`（例: `eda-page-default-linux.png`）。OSはスクリプトで付与。

CI との連携（概要）
- ジョブ順序: Nodeセットアップ → Lint/Type/Vitest → Python/OpenAPI検証 → Storybook build → Playwright VR。
- 初回 Linux ベースラインは自動生成（以降は差分検知）。失敗時はレポート（HTML）をアーティファクト化。

---

## 4. アドオン/デコレータ詳細

MSW（msw-storybook-addon）
- `initialize()` を `preview.ts` で呼び、`parameters.msw.handlers` で各ストーリーのレスポンスを定義。
- 既存の `src/tests/msw/handlers.ts` を流用可。

Router（storybook-addon-react-router-v6）
- `withRouter` を `decorators` に追加。Pageストーリーでは `MemoryRouter` でも可。

Docs（@storybook/addon-docs）
- MDX で使用例/バリエーション/アクセシビリティを記述。UIガイドとして参照。

A11y（@storybook/addon-a11y）
- 主要ストーリーでコントラストや landmark 構造を検査。VR と組み合わせて品質担保。

---

## 5. ベストプラクティス

- 非決定的要素の固定: フォント/時刻/乱数/アニメーション（`preview.ts` で抑止）。
- ネットワーク依存の廃止: すべて MSW で完結。Secrets を stories に直書きしない。
- 大型コンポーネントは Page ストーリーで再現し、重要シナリオのみ VR 対象に。
- ストーリーIDは固定（title/コンポーネント名の変更時はVR更新）。

---

## 6. よくある課題と対処

- 警告: Browserslist 警告 → `npx update-browserslist-db@latest` で解消可（任意）。
- React Router future flags の警告 → 実害なし。必要なら `preview.ts` で suppress。
- CI とローカルの差分 → ベースラインは OS 別。`*-darwin.png` はローカル、CI は `*-linux.png`。

---

## 7. 変更フロー（開発者向け）

1) 新規ストーリー/Docsを作成（UI → Page）。
2) MSW ハンドラを用意し、状態バリエーション（空/多数/エラー）を定義。
3) ローカルで `pnpm -C apps/web storybook` → 表示確認。
4) VR 対象なら Playwright にテストを追加 → ベースライン生成をコミット。
5) PR で CI 実行。差分が出た場合は意図有/無を評価し、必要最小限でベースライン更新。

---

## 8. 参考（本リポジトリの実装痕跡）

- `apps/web/src/components/ui/*.stories.tsx`（Button/Card/Pill/StatCard/Toast）
- `apps/web/src/components/ui/*.docs.mdx`（Pill/StatCard/Toast）
- `apps/web/src/components/layout/AppLayout.stories.tsx`（MemoryRouter + MSW）
- `apps/web/src/pages/*Page.stories.tsx`（PII/Leakage など）
- `apps/web/src/tests/msw/*`（共通MSWハンドラ）

---

付録A: 代表ストーリー追加のテンプレ
```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './Pill';

const meta: Meta<typeof Pill> = {
  title: 'Components/Pill',
  component: Pill,
};
export default meta;

export const ToneVariants: StoryObj<typeof Pill> = {
  args: { children: 'High', tone: 'red' },
};
```

付録B: Docs(MDX) テンプレ
```mdx
import { Meta, Canvas, Story, Subtitle, Description } from '@storybook/blocks';
import { Pill } from './Pill';

<Meta title="Components/Pill" of={Pill} />
<Subtitle>重要度/状態を色で示すピル。</Subtitle>
<Description>red/amber/emerald の3トーンを採用。</Description>

<Canvas><Story of={Pill} name="Tone Variants" /></Canvas>
```
