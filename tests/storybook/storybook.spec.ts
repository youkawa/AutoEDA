import { test, expect } from '@playwright/test';

const stories = [
  { id: 'pages-homepage--default', snapshot: 'home-default.png' },
  { id: 'pages-datasetspage--default', snapshot: 'datasets-default.png' },
  { id: 'pages-edapage--default', snapshot: 'eda-default.png' },
  { id: 'pages-actionspage--standard', snapshot: 'actions-standard.png' },
  { id: 'pages-piipage--detected', snapshot: 'pii-detected.png' },
  { id: 'pages-settingspage--openai-configured', snapshot: 'settings-openai-configured.png' },
  { id: 'layout-applayout--with-dataset', snapshot: 'layout-with-dataset.png' },
];

for (const story of stories) {
  test(`visual regression for ${story.id}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot(story.snapshot, { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
}
