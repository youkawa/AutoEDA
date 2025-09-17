import { test, expect } from '@playwright/test';

test.describe('Acceptance scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.click('text=Datasets');
    await page.click('text=sales.csv');
    await expect(page.getByRole('heading', { name: 'EDA 概要' })).toBeVisible();
  });

  test('A2 charts suggestions surface consistent candidates', async ({ page }) => {
    await page.click('text=可視化を自動提案');
    await expect(page.getByRole('heading', { name: 'Charts 候補' })).toBeVisible();
    const firstCandidate = page.locator('h1:has-text("Charts 候補") + ul li').first();
    await expect(firstCandidate).toContainText('consistency:');
    await expect(firstCandidate).toContainText('根拠:');
    await expect(page.locator('ul li').filter({ hasText: 'consistency: 90' })).toHaveCount(0);
  });

  test('B1 Q&A response maintains citation coverage', async ({ page }) => {
    await page.getByRole('link', { name: 'Q&A' }).click();
    await expect(page.getByRole('heading', { name: 'Q&A' })).toBeVisible();
    await page.getByRole('button', { name: '質問する' }).click();
    await expect(page.getByRole('heading', { name: '回答' })).toBeVisible();
    await expect(page.getByText(/引用被覆率/)).toContainText('%');
  });

  test('C1 PII workflow lists detected fields with mask options', async ({ page }) => {
    await page.getByRole('link', { name: 'PII' }).click();
    await expect(page.getByRole('heading', { name: 'PII スキャン' })).toBeVisible();
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
    await page.getByRole('link', { name: 'Next Actions' }).click();
    await expect(page.getByRole('heading', { name: 'Next Actions' })).toBeVisible();
    await expect(page.getByText('LLMフォールバック: ツール要約のみ表示中')).toBeVisible();
    await page.getByRole('button', { name: '引用ビュー' }).click();
    await expect(page.getByText('参照一覧')).toBeVisible();
    await expect(page.getByText(/tool:/)).toBeVisible();
  });

  test('C2 Leakage page lists flagged columns', async ({ page }) => {
    await page.getByRole('link', { name: 'Leakage' }).click();
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
    await page.getByRole('link', { name: 'Recipes' }).click();
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
    await expect(page.getByText('artifact_hash:')).toBeVisible();
    await expect(page.getByText('LLMフォールバック: ツール要約のみ表示中')).toBeVisible();

    await page.getByRole('button', { name: '引用ビュー' }).click();
    await expect(page.getByText('参照一覧')).toBeVisible();
    await expect(page.locator('ul li').filter({ hasText: 'tool:' })).toHaveCount(1);

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
