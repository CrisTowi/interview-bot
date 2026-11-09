import { expect, savedState, seed, session, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seed(page, savedState({ history: [session()] }));
  await page.goto('/');
});

test('the home page is a sentence with pickers and a start button', async ({ page }) => {
  await expect(page).toHaveTitle('Interview Bot — Practica entrevistas behavioral');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interview Bot: Practica entrevistas behavioral');
  await expect(page.getByRole('button', { name: 'Nivel: Senior' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Empezar entrevista' })).toBeEnabled();
});

test('a picker works with the keyboard and the choice persists after reload', async ({ page }) => {
  const level = page.getByRole('button', { name: 'Nivel: Senior' });
  await level.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Nivel' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Nivel: Staff' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nivel: Staff' })).toBeVisible();
});

test('the length stays out of the sentence unless you ask for a shorter interview', async ({ page }) => {
  await expect(page.getByRole('button', { name: /^Duración/ })).toHaveCount(0);
  await page.getByRole('button', { name: '¿Poco tiempo? Haz una versión corta' }).click();
  // The picker appears already open, on the 20-minute option.
  await expect(page.getByRole('listbox', { name: 'Duración' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Duración: 20 minutos' })).toBeFocused();
  await expect(page.getByRole('button', { name: /Poco tiempo/ })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Duración: 20 minutos' }).click();
  await page.getByRole('option', { name: /30 minutos/ }).click();
  await expect(page.getByRole('button', { name: /^Duración/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '¿Poco tiempo? Haz una versión corta' })).toBeFocused();
});

test('the interview cannot start without a role', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Puesto' }).fill('');
  await expect(page.getByRole('button', { name: 'Empezar entrevista' })).toBeDisabled();
});

test('the language switch translates the whole app and remembers it', async ({ page }) => {
  await page.getByRole('button', { name: /Idioma de la app/ }).click();
  await expect(page.getByRole('button', { name: 'Start interview' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Past sessions' })).toBeVisible();
});

test('past sessions open their results and can be cleared after confirming', async ({ page }) => {
  await page.getByRole('button', { name: /Conflictos, Amazon/ }).click();
  await expect(page.getByRole('heading', { name: 'Probablemente no' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al inicio' }).click();

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('1 sesiones anteriores de este navegador');
    dialog.accept();
  });
  await page.getByRole('button', { name: 'Borrar historial' }).click();
  await expect(page.getByRole('heading', { name: 'Sesiones anteriores' })).toBeHidden();
});
