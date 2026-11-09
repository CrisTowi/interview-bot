import { evaluation, expect, isEvaluation, mockChat, savedState, seed, test, type ChatRequest } from './fixtures';

const answer = async (page: import('@playwright/test').Page, text: string) => {
  await page.getByRole('button', { name: 'Escribir respuesta' }).click();
  await page.getByRole('textbox', { name: 'Escribir respuesta' }).fill(text);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
};

/** A model that greets, takes a note on the answer, reviews its notes, then says goodbye and hangs up. */
function agentScript(req: ChatRequest) {
  if (isEvaluation(req)) return { text: evaluation() };
  const last = req.messages.at(-1)!;
  if (last.role === 'user' && last.content.startsWith('('))
    return { text: 'Hola. Cuéntame de un proyecto que lideraste.' };
  if (last.role === 'user')
    return {
      toolCalls: [
        {
          id: 'n1',
          name: 'take_note',
          args: {
            dimension: 'ownership',
            signal: 'gap',
            observation: 'Habló del equipo.',
            quote: 'nosotros lo hicimos',
          },
        },
      ],
    };
  if (last.name === 'take_note') return { toolCalls: [{ id: 'r1', name: 'review_notes', args: {} }] };
  return {
    text: 'Gracias, hemos terminado. ¡Hasta pronto!',
    toolCalls: [{ id: 'e1', name: 'end_interview', args: {} }],
  };
}

test.beforeEach(async ({ page }) => {
  await seed(page, savedState());
});

test('agent mode: the interviewer takes notes, hangs up by itself and the results show the notes', async ({ page }) => {
  const requests = await mockChat(page, agentScript);
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();

  await expect(page.getByText('Cuéntame de un proyecto que lideraste.')).toBeVisible();
  await expect(page.getByText(/^Modo agente/)).toBeVisible();
  expect(requests[0].tools?.map((t) => t.name)).toEqual(['take_note', 'review_notes', 'end_interview']);

  await answer(page, 'Lideré la migración; nosotros lo hicimos todo.');

  // No click on "Terminar": the interviewer ends the call.
  await expect(page.getByRole('heading', { name: 'Probablemente no' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Notas del entrevistador' })).toBeVisible();
  await expect(page.getByText('“nosotros lo hicimos”')).toBeVisible();

  const review = requests.find((r) => r.messages.at(-1)?.name === 'review_notes')!;
  expect(review.messages.at(-1)!.content).toContain(
    'No evidence yet for: structure, specificity, impact, scope, communication.',
  );
  expect(requests.find(isEvaluation)!.system).toContain('Habló del equipo.');
});

test('basic mode: a model that rejects tools keeps the interview going without them, visibly', async ({ page }) => {
  const requests = await mockChat(page, (req) =>
    isEvaluation(req) ? { text: evaluation() } : { text: 'Hola. Cuéntame de un conflicto.', toolsUnsupported: true },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();
  await expect(page.getByText(/^Modo básico/)).toBeVisible();
  await answer(page, 'Tuve un desacuerdo con producto.');
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].tools).toBeUndefined();

  await page.getByRole('button', { name: 'Terminar la entrevista' }).click();
  await expect(page.getByText(/Esta entrevista fue en modo básico/)).toBeVisible();
});

test('hanging up before answering shows the pending question and lets you try again', async ({ page }) => {
  await mockChat(page, () => ({ text: 'Hola. Cuéntame de una vez que fallaste.' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();
  await expect(page.getByText('Cuéntame de una vez que fallaste.')).toBeVisible();
  await page.getByRole('button', { name: 'Terminar la entrevista' }).click();

  await expect(page.getByRole('heading', { name: 'Colgaste antes de responder' })).toBeVisible();
  await expect(page.getByText('Hola. Cuéntame de una vez que fallaste.')).toBeVisible();
  await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
  await expect(page.getByRole('button', { name: 'Terminar la entrevista' })).toBeVisible();
});

test('a provider error is shown with its real cause and can be retried', async ({ page }) => {
  let calls = 0;
  await mockChat(page, () =>
    ++calls === 2 ? { status: 429, error: 'temporarily rate-limited upstream' } : { text: 'Siguiente pregunta.' },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();
  await answer(page, 'Mi respuesta.');
  await expect(page.getByRole('alert')).toContainText('temporarily rate-limited upstream');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Siguiente pregunta.').first()).toBeVisible();
});

test('the transcript panel shows the whole conversation', async ({ page }) => {
  await mockChat(page, (req) => ({ text: req.messages.length > 1 ? 'Segunda pregunta.' : 'Primera pregunta.' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();
  await answer(page, 'Mi primera respuesta.');
  await page.getByRole('button', { name: 'Transcripción' }).click();
  const panel = page.getByRole('complementary', { name: 'Transcripción' });
  await expect(panel).toContainText('Primera pregunta.');
  await expect(panel).toContainText('Mi primera respuesta.');
  await expect(panel).toContainText('Segunda pregunta.');
});

test('the chosen length sets the plan, the clock and the time checks the interviewer gets', async ({ page }) => {
  await page.clock.install();
  const requests = await mockChat(page, agentScript);
  await page.goto('/');
  await page.getByRole('button', { name: '¿Poco tiempo? Haz una versión corta' }).click();
  await page.getByRole('option', { name: /10 minutos/ }).click();
  await page.getByRole('button', { name: 'Empezar entrevista' }).click();

  await expect(page.getByText('Cuéntame de un proyecto que lideraste.')).toBeVisible();
  expect(requests[0].system).toContain('lasts about 10 minutes: cover about 2 main questions');
  await expect(page.getByText('/ 10:00')).toBeVisible();

  await page.clock.fastForward('08:00');
  await expect(page.getByRole('progressbar', { name: 'Tiempo de la entrevista' })).toHaveAttribute(
    'aria-valuetext',
    '8 de 10 minutos, quedan 2',
  );
  await answer(page, 'Lideré la migración.');
  await expect(page.getByRole('heading', { name: 'Probablemente no' })).toBeVisible({ timeout: 10_000 });

  // The model sees the time check after the answer; the transcript and the evaluation don't.
  const sent = requests.find((r) => r.messages.at(-1)?.content.startsWith('Lideré'))!;
  expect(sent.messages.at(-1)!.content).toContain('about 2 of 10 minutes left');
  const evaluationRequest = requests.find(isEvaluation)!;
  expect(JSON.stringify(evaluationRequest.messages)).not.toContain('Time check');
});
