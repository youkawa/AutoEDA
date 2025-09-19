import { test, expect } from '@playwright/test';

test.skip(!!process.env.CI, 'UI-only stubbed test is skipped on CI to avoid flakiness.');

test('Charts batch UI flows with network stubs', async ({ page }) => {
  // suggestions stub (POST)
  await page.route('**/api/charts/suggest', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { charts: [ { id: 'c1', type: 'bar', explanation: 'bar', source_ref: { kind: 'figure', locator: 'fig:1' }, consistency_score: 0.97 } ] } });
  });
  // stub batch begin
  await page.route('**/api/charts/generate-batch', async (route) => {
    await route.fulfill({ json: { batch_id: 'b1', total: 1, done: 0, running: 1, failed: 0, items: [] } });
  });
  // stub batch status
  let polled = 0;
  await page.route('**/api/charts/batches/*', async (route) => {
    polled++;
    if (polled < 2) {
      await route.fulfill({ json: { batch_id: 'b1', total: 1, done: 0, running: 1, failed: 0, items: [] } });
    } else {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"></svg>';
      await route.fulfill({ json: { batch_id: 'b1', total: 1, done: 1, running: 0, failed: 0, items: [], results_map: { c1: { language: 'python', library: 'vega', outputs: [{ type: 'image', mime: 'image/svg+xml', content: svg }] } } } });
    }
  });

  await page.goto('/charts/ds_001');
  await expect(page.getByRole('heading', { name: 'チャート提案' })).toBeVisible();
  // select one (wait until checkbox is rendered)
  await expect(page.getByText(/根拠:/).first()).toBeVisible();
  const cb = page.locator('label:has-text("選択") >> input[type="checkbox"]');
  await cb.first().check();
  await page.getByRole('button', { name: '一括生成' }).click();
  // progress visible then images appear
  await expect(page.getByText(/一括生成中/)).toBeVisible();
  await expect(page.locator('img[alt="generated chart"]').first()).toBeVisible({ timeout: 5000 });
});
