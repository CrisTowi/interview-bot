import { expect, isCvSummary, mockChat, savedState, seed, test } from './fixtures';

const BRIEFING = 'Perfil: Senior Software Engineer en fintech.\nTemas para preguntar: Cómo alineó a tres equipos.';

test.beforeEach(async ({ page }) => {
  await seed(page, savedState());
});

test('a CV file becomes an editable briefing that the interviewer then uses', async ({ page }) => {
  const requests = await mockChat(page, (req) =>
    isCvSummary(req) ? { text: BRIEFING } : { text: 'Hola. Vi que lideraste pagos.' },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Mariana Ríos. Senior Software Engineer en PagoFácil. Lideré la migración de pagos con tres equipos.',
    ),
  });

  await expect(page.getByText('Cómo alineó a tres equipos.')).toBeVisible();
  expect(requests[0].messages[0].content).toContain('PagoFácil');
  await expect(page.getByRole('button', { name: /Perfil/ }).getByLabel('Usando tu CV')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].system).toContain('Cómo alineó a tres equipos.');
});

test('pasted text works too, and the briefing can be removed', async ({ page }) => {
  await mockChat(page, () => ({ text: BRIEFING }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: /Pegar texto/ }).click();
  await page
    .getByRole('textbox', { name: 'Pegar texto' })
    .fill('Diez años de experiencia en desarrollo web, liderando equipos de producto y plataforma.');
  await page.getByRole('button', { name: 'Preparar mi ficha' }).click();
  await expect(page.getByText('Senior Software Engineer en fintech.')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Quitar' }).click();
  await expect(page.getByRole('button', { name: /Subir mi CV/ })).toBeVisible();
});

test('a file without text explains what to do instead', async ({ page }) => {
  await mockChat(page, () => ({ text: BRIEFING }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Perfil' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'scan.txt', mimeType: 'text/plain', buffer: Buffer.from('short') });
  await expect(page.getByRole('alert')).toContainText('pega el texto en su lugar');
});
