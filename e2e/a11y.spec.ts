import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { evaluation, expect, isEvaluation, mockChat, savedState, seed, session, test } from './fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const violations = async (page: Page) => (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`WCAG 2.2 AA · ${scheme} theme`, () => {
    // Reduced motion turns off the menus' fade-in, so axe measures the final colors, not a half-faded frame.
    test.use({ colorScheme: scheme, reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await seed(page, savedState({ history: [session()] }));
    });

    test('home and settings', async ({ page }) => {
      await page.goto('/');
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Ajustes' }).click();
      await page.getByRole('button', { name: /Motor de IA/ }).click();
      expect(await violations(page)).toEqual([]);
    });

    test('call and results', async ({ page }) => {
      await mockChat(page, (req) =>
        isEvaluation(req) ? { text: evaluation() } : { text: 'Hola. Cuéntame de un proyecto.' },
      );
      await page.goto('/');
      await page.getByRole('button', { name: /Conflictos, Amazon/ }).click();
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Practicar otra vez' }).click();
      await expect(page.getByText('Cuéntame de un proyecto.')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
