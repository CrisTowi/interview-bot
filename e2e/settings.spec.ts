import { expect, savedState, seed, test } from './fixtures';

const openSettings = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  return page.getByRole('dialog', { name: 'Ajustes' });
};

test('the overview shows each section’s state and opens it beside the menu', async ({ page }) => {
  await seed(page, savedState());
  await page.goto('/');
  const menu = await openSettings(page);
  await expect(menu.getByRole('button', { name: /Motor de IA.*Anthropic, claude-haiku-5-5/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Sincronización.*no necesitas configurar nada/ })).toBeVisible();

  await menu.getByRole('button', { name: /Motor de IA/ }).click();
  const panel = page.getByRole('dialog', { name: 'Motor de IA' });
  await expect(panel.getByRole('status')).toHaveText(/Modo agente/);
});

test('OpenRouter: pick a model from the catalog, filter by agent support, see basic mode', async ({ page }) => {
  await seed(
    page,
    savedState({ settings: { cloud: { provider: 'openrouter', apiKey: 'k', model: 'anthropic/claude-haiku-5.5' } } }),
  );
  await page.goto('/');
  const menu = await openSettings(page);
  await menu.getByRole('button', { name: /Motor de IA/ }).click();
  const panel = page.getByRole('dialog', { name: 'Motor de IA' });

  await panel.getByRole('button', { name: /Anthropic: Claude Haiku 5.5/ }).click();
  await panel.getByRole('radio', { name: 'Agente' }).click();
  const models = panel.getByRole('listbox', { name: 'Modelos' });
  await expect(models.getByRole('option')).toHaveCount(1);
  await panel.getByRole('radio', { name: 'Todos' }).click();
  await models.getByRole('option', { name: /Acme: No Tools/ }).click();

  await expect(panel.getByRole('status')).toHaveText(/Modo básico/);
  await expect(menu.getByRole('button', { name: /Motor de IA.*modo básico/ })).toBeVisible();
});

test('Chrome’s local model always runs in basic mode', async ({ page }) => {
  await seed(page, savedState({ settings: { llm: 'local' } }));
  await page.goto('/');
  const menu = await openSettings(page);
  await menu.getByRole('button', { name: /Motor de IA/ }).click();
  await expect(page.getByRole('dialog', { name: 'Motor de IA' }).getByRole('status')).toHaveText(/Modo básico/);
});

test('a missing API key is flagged and the start button sends you to settings', async ({ page }) => {
  await seed(page, savedState({ settings: { cloud: { provider: 'anthropic', apiKey: '', model: 'm' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Elegir motor de IA' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Ajustes' }).getByRole('button', { name: /falta tu API key/ }),
  ).toBeVisible();
});

test('sync explains that local storage needs no setup and Nostr is optional', async ({ page }) => {
  await seed(page, savedState());
  await page.goto('/');
  const menu = await openSettings(page);
  await menu.getByRole('button', { name: /Sincronización/ }).click();
  const panel = page.getByRole('dialog', { name: 'Sincronización' });
  await expect(panel).toContainText('ya se guardan en este navegador, sin cuentas');
  await expect(panel).toContainText('Opcional: usar en otros dispositivos');
});

test('menus close with Escape and give focus back to their button', async ({ page }) => {
  await seed(page, savedState());
  await page.goto('/');
  await openSettings(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ajustes' })).toBeFocused();
});
