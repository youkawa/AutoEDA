import { test, expect } from '@playwright/test';

const stories = [
  { id: 'pages-analysispage--default', snapshot: 'analysis-default.png' },
];

for (const story of stories) {
  test(`visual regression for ${story.id}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(story.snapshot, { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
}

