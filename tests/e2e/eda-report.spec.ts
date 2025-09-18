import { test, expect } from '@playwright/test';

test('EDA report shows key features and actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'データセットを選択' })).toBeVisible();
  await page.getByRole('button', { name: 'データセットを選択' }).click();
  const row = page.locator('tr', { hasText: 'sales.csv' }).first();
  await row.getByRole('button', { name: 'EDA を開始' }).click();
  await expect(page.getByText('データ品質トリアージ')).toBeVisible();
  await expect(page.locator('div').filter({ hasText: '推奨アクション' })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: '推奨アクション' }).locator('li').first()).toContainText('score');
  await page.getByRole('button', { name: '引用ビュー' }).click();
  await expect(page.getByText('tbl:summary')).toBeVisible();
});
