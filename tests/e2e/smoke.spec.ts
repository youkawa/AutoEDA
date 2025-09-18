import { test, expect } from '@playwright/test';

test('navigate to datasets and EDA page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'データセットを選択' })).toBeVisible();
  await page.getByRole('button', { name: 'データセットを選択' }).click();
  await expect(page.locator('body')).toContainText('customers.csv');
  const row = page.locator('tr', { hasText: 'sales.csv' }).first();
  await row.getByRole('button', { name: 'EDA を開始' }).click();
  await expect(page.getByText('データ品質トリアージ')).toBeVisible();
});
