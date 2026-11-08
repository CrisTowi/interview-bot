import { expect, mockChat, savedState, seed, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seed(page, savedState());
});

test('the top bar fits on one line and menus stay on screen', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('.topbar');
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(64);

  await page.getByRole('button', { name: 'Ajustes' }).click();
  const menu = (await page.getByRole('dialog', { name: 'Ajustes' }).boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(width);
});

test('a settings section opens inline under its row', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: /Voz e idioma/ }).click();
  await expect(page.getByRole('combobox', { name: 'Idioma de la entrevista' })).toBeVisible();
});

test('the call controls are reachable on a phone', async ({ page }) => {
  await mockChat(page, () => ({ text: 'Hola.' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();
  await expect(page.getByRole('button', { name: 'Terminar la entrevista' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Escribir respuesta' })).toBeInViewport();
});
