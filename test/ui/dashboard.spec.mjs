import { test, expect } from '@playwright/test';

test('preview is honest, presets work, and all pages are reachable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#connection-badge')).toContainText('Preview');
  await expect(page.locator('#review-apply')).toBeDisabled();
  await page.getByRole('button', { name: /Maximum FPS/ }).click();
  await expect(page.locator('#action-title')).toHaveText('Maximum FPS preset selected');
  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  await expect(page.locator('#scale-value')).toHaveText('70%');
  await page.locator('#fps-cap').selectOption('277');
  await page.locator('#resolution-scale').fill('85');
  await expect(page.locator('#render-resolution')).toContainText('1632 × 918');
  await page.getByRole('button', { name: /Input latency/ }).click();
  await page.locator('[data-check="refresh"]').check();
  await expect(page.locator('#checklist-progress')).toContainText('1 of 5');
  await page.reload();
  await page.getByRole('button', { name: /Input latency/ }).click();
  await expect(page.locator('[data-check="refresh"]')).toBeChecked();
  await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
  await expect(page.locator('#restore')).toBeDisabled();
  expect(errors).toEqual([]);
});

async function mockWindows(page, { configFound = true, failApply = false } = {}) {
  await page.addInitScript(({ configFound, failApply }) => {
    let backup = null;
    window.testCalls = [];
    const getStatus = () => ({ supported: true, configFound, backup });
    window.optimizer = {
      status: async () => ({ ok: true, data: getStatus() }),
      scan: async () => ({ ok: true, data: { ...getStatus(), hardware: { cpu: 'Intel Core i5-10600K', gpu: 'AMD Radeon RX 6600', ramGB: 16, freeGB: 150, totalGB: 471, os: 'Windows 11' } } }),
      apply: async options => {
        window.testCalls.push(options);
        backup = { preset: options.preset, state: failApply ? 'incomplete' : 'applied', applied: failApply ? 1 : 4, total: 4, createdAt: new Date().toISOString() };
        return failApply ? { ok: false, error: 'Simulated failure. Restore your backup.' } : { ok: true, data: { message: 'Settings applied and originals backed up.' } };
      },
      restore: async () => { backup = null; return { ok: true, data: { message: 'Original settings restored.' } }; },
      openBackups: async () => ({ ok: true }), openDisplay: async () => ({ ok: true }), minimize: async () => ({ ok: true }), close: async () => ({ ok: true })
    };
  }, { configFound, failApply });
}

test('review shows actual selections, applies once, and restores', async ({ page }) => {
  await mockWindows(page);
  await page.goto('/');
  await expect(page.locator('#hardware-source')).toHaveText('DETECTED ON THIS PC');
  await page.locator('#review-apply').click();
  await expect(page.locator('#change-list')).toContainText('280 FPS cap');
  await expect(page.locator('#change-list')).toContainText('Disable Windows Game DVR');
  await expect(page.locator('#change-list')).not.toContainText('High performance');
  await page.locator('#dialog-confirm').click();
  await expect(page.locator('#notice')).toContainText('Settings applied');
  await expect(page.locator('#review-apply')).toBeDisabled();
  expect(await page.evaluate(() => window.testCalls.length)).toBe(1);
  await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
  await page.locator('#restore').click();
  await page.locator('#dialog-confirm').click();
  await expect(page.locator('#notice')).toContainText('Original settings restored');
  await expect(page.locator('#review-apply')).toBeEnabled();
  await expect(page.locator('#restore')).toBeDisabled();
});

test('missing config blocks game edits but permits Windows-only changes', async ({ page }) => {
  await mockWindows(page, { configFound: false });
  await page.goto('/');
  await page.locator('#review-apply').click();
  await expect(page.locator('#confirm-dialog')).not.toBeVisible();
  await expect(page.locator('#notice')).toContainText('Launch Fortnite once');
  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  await page.locator('#fortnite-toggle').uncheck();
  await page.locator('#review-apply').click();
  await expect(page.locator('#change-list')).not.toContainText('Fortnite preset');
  await page.locator('#dialog-confirm').click();
  await expect(page.locator('#notice')).toContainText('Settings applied');
  expect((await page.evaluate(() => window.testCalls))[0].fortnite).toBe(false);
});

test('failed application offers recovery without pretending success', async ({ page }) => {
  await mockWindows(page, { failApply: true });
  await page.goto('/');
  await page.locator('#review-apply').click();
  await page.locator('#dialog-confirm').click();
  await expect(page.locator('#notice')).toContainText('Simulated failure');
  await expect(page.locator('#backup-badge')).toHaveText('RECOVERY NEEDED');
  await expect(page.locator('#restore')).toBeEnabled();
  await expect(page.locator('#review-apply')).toBeDisabled();
});

test('dashboard fits desktop and small screens without horizontal overflow', async ({ page }) => {
  for (const width of [1250, 960, 600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1250, height: 900 });
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
});
