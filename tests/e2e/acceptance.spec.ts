import { test, expect } from '@playwright/test';

test.describe('Acceptance scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'データセットを選択' })).toBeVisible();
    await page.getByRole('button', { name: 'データセットを選択' }).click();
    await page.click('text=sales.csv');
    await expect(page.getByText('データ品質トリアージ')).toBeVisible();
  });

  test('A2 charts suggestions surface consistent candidates', async ({ page }) => {
    await page.getByRole('button', { name: 'チャート提案を見る' }).click();
    await expect(page.getByText('チャート提案')).toBeVisible();
    await expect(page.getByText('整合性チェック済み')).toBeVisible();
    await expect(page.getByText(/根拠:/)).toBeVisible();
  });

  test('B1 Q&A response maintains citation coverage', async ({ page }) => {
    await page.getByRole('link', { name: 'Q&A' }).click();
    await expect(page.getByText('根拠付き Q&A')).toBeVisible();
    await page.getByRole('button', { name: '分析を実行' }).click();
    await expect(page.getByRole('heading', { name: '回答' })).toBeVisible();
    await expect(page.getByText(/引用被覆率/)).toContainText('%');
  });

  test('C1 PII workflow lists detected fields with mask options', async ({ page }) => {
    await page.getByRole('link', { name: 'PII検出' }).click();
    await expect(page.getByText('PII スキャン結果')).toBeVisible();
    await expect(page.getByText('検出フィールド')).toBeVisible();
    await expect(page.getByRole('button', { name: 'マスクを適用して再計算' })).toBeEnabled();
    const checkbox = page.getByRole('checkbox').first();
    const initialState = await checkbox.isChecked();
    await checkbox.click();
    await page.getByRole('button', { name: 'マスクを適用して再計算' }).click();
    await expect(page.getByText(/適用済み/)).not.toContainText('なし');
    if (!initialState) {
      await expect(page.getByRole('button', { name: 'マスクを適用して再計算' })).toBeEnabled();
    }
  });

  test('B2 Next Actions view exposes fallback and references', async ({ page }) => {
    await page.getByRole('link', { name: '次アクション' }).click();
    await expect(page.getByText('推奨アクション・優先度')).toBeVisible();
    await expect(page.getByText(/LLM フォールバック/)).toBeVisible();
    await page.getByRole('button', { name: '引用を確認' }).click();
    await expect(page.getByText(/(table: tbl:summary|doc: tool:fallback)/)).toBeVisible();
  });

  test('C2 Leakage page lists flagged columns', async ({ page }) => {
    await page.getByRole('link', { name: 'リーク検査' }).click();
    await expect(page.getByRole('heading', { name: 'リーク検査' })).toBeVisible();
    await expect(page.getByText('検出されたリーク候補')).toBeVisible();
    const firstCheckbox = page.locator('ul li input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible();
    await firstCheckbox.click();
    const excludeButton = page.getByRole('button', { name: '除外して再計算' });
    if (await excludeButton.isEnabled()) {
      await excludeButton.click();
      await expect(page.getByText(/除外済み/)).not.toContainText('なし');
    }
  });

  test('D1 Recipes page shows artifacts and warnings', async ({ page }) => {
    await page.getByRole('link', { name: 'レシピ出力' }).click();
    await expect(page.getByText('再現レシピと成果物')).toBeVisible();
    await expect(page.getByText('artifact_hash:')).toBeVisible();
    await expect(page.getByText(/LLM フォールバック/)).toBeVisible();

    await page.getByRole('button', { name: '引用を確認' }).click();
    await expect(page.locator('div').filter({ hasText: 'doc: tool:fallback' })).toHaveCount(1);

    await page.getByRole('button', { name: '統計ビュー' }).click();
    const statsItems = page.locator('section').filter({ hasText: '再現統計' }).locator('li');
    if ((await statsItems.count()) >= 3) {
      const parseNumber = (text: string) => parseFloat(text.replace(/[^0-9.\-]/g, ''));
      const rows = parseNumber(await statsItems.nth(0).innerText());
      const cols = parseNumber(await statsItems.nth(1).innerText());
      const missingRate = parseNumber(await statsItems.nth(2).innerText()) / 100;

      const baseRows = parseNumber((await page.locator('div').filter({ hasText: /^行数:/ }).first().innerText()).split(':')[1]);
      const baseCols = parseNumber((await page.locator('div').filter({ hasText: /^列数:/ }).first().innerText()).split(':')[1]);
      const baseMissing = parseNumber((await page.locator('div').filter({ hasText: /^欠損率:/ }).first().innerText()).split(':')[1]) / 100;

      const withinTolerance = (expected: number, actual: number) => {
        const base = Math.abs(expected) > 1e-6 ? Math.abs(expected) : 1;
        return Math.abs(actual - expected) / base <= 0.01;
      };

      expect(withinTolerance(baseRows, rows)).toBeTruthy();
      expect(withinTolerance(baseCols, cols)).toBeTruthy();
      expect(withinTolerance(baseMissing, missingRate)).toBeTruthy();
    } else {
      await expect(page.getByText('LLMフォールバック: ツール要約のみ表示中')).toBeVisible();
    }
  });
});
