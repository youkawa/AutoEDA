import { test, expect } from '@playwright/test';

test('navigate to datasets and EDA page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.click('text=Datasets');
  // DatasetsPage renders DashboardSection; ensure any text appears
  await expect(page.locator('body')).toContainText('customers.csv');
});
