import { test, expect } from '@playwright/test';

const stories = [
  { id: 'pages-chartspage--consistent-only', snapshot: 'charts-consistent.png' },
  { id: 'pages-chartspage--empty', snapshot: 'charts-empty.png' },
  { id: 'pages-chartspage--with-result', snapshot: 'charts-with-result.png' },
];

for (const story of stories) {
  test(`visual regression for ${story.id}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    // 安定化: レイアウト確定を待つ
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(story.snapshot, { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
}
