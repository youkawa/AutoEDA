import { test, expect } from '@playwright/test';

test('EDA report shows key features and actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.click('text=Datasets');
  await page.click('text=sales.csv');

  await expect(page.getByRole('heading', { name: 'サマリー', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '品質課題' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '次アクション' })).toBeVisible();
  await expect(page.locator('ol li').first()).toContainText('score');
  await expect(page.getByText('LLMフォールバック: ツール要約のみ表示中')).toBeVisible();
  await page.getByRole('button', { name: '引用ビュー' }).click();
  await expect(page.getByText('参照一覧')).toBeVisible();
});
