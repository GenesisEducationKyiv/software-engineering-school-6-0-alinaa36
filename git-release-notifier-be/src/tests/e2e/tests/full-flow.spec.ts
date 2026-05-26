import { test, expect } from '../fixtures/base.fixture';

const EXISTING_REPO = 'facebook/react';
const API_KEY =
  process.env.API_KEY ??
  (() => {
    throw new Error('API_KEY not set');
  })();

test.describe('Повний flow підписки', () => {
  test('subscribe → confirm → перевірка в списку → unsubscribe', async ({
    page,
    prisma,
    uniqueEmail,
    waitForDbState,
  }) => {
    // --- Крок 1: підписка ---
    await page.goto('/');

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'Репозиторій' }).fill(EXISTING_REPO);

    await page.getByRole('button', { name: 'Підписатися' }).click();

    await expect(page.getByTestId('message')).toHaveClass(/success/);

    // --- Крок 2: отримуємо токен для підтвердження ---
    await waitForDbState(async () => {
      const sub = await prisma.subscription.findFirst({
        where: { email: uniqueEmail, repository: EXISTING_REPO },
      });

      return sub !== null;
    });

    const sub = await prisma.subscription.findFirst({
      where: { email: uniqueEmail, repository: EXISTING_REPO },
    });

    await page.goto(`/api/confirm/${sub?.confirmToken}`);

    await expect(page.locator('h1')).toContainText('Підписку підтверджено!');
    await expect(page.getByTestId('repo-name')).toContainText(EXISTING_REPO);

    // --- Крок 3: перевірка в списку підписок ---
    await page.goto('/subscriptions');

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'API Key' }).fill(API_KEY);

    await page.getByRole('button', { name: 'Пошук' }).click();

    await expect(page.getByTestId('resultsHeader')).toContainText('Знайдено: 1 підписок');
    await expect(page.getByTestId('item-repo')).toContainText(EXISTING_REPO);
    await expect(page.getByTestId('badge-active')).toContainText('Активна');

    // --- Крок 4: відписка ---
    await page.goto(`/api/unsubscribe/${sub?.unsubscribeToken}`);

    await expect(page.locator('h1')).toContainText('Відписку підтверджено');
    await expect(page.getByTestId('repo-name')).toContainText(EXISTING_REPO);

    // --- Крок 5: перевірка що підписка зникла зі списку ---
    await page.goto('/subscriptions');

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'API Key' }).fill(API_KEY);

    await page.getByRole('button', { name: 'Пошук' }).click();

    await expect(page.getByTestId('empty')).toBeVisible();
    await expect(page.getByTestId('empty')).toContainText('Підписок не знайдено');
  });

  test('повторна підписка після відписки — можлива', async ({
    page,
    uniqueEmail,
    createActiveSubscription,
  }) => {
    // --- Крок 1: відписка ---
    const sub = await createActiveSubscription({
      email: uniqueEmail,
      repository: EXISTING_REPO,
      confirmToken: `confirm-first-${Date.now()}`,
      unsubscribeToken: `unsub-first-${Date.now()}`,
    });

    await page.goto(`/api/unsubscribe/${sub.unsubscribeToken}`);

    await expect(page.locator('h1')).toContainText('Відписку підтверджено');

    // --- Крок 2: повторна підписка ---
    await page.goto('/');

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'Репозиторій' }).fill(EXISTING_REPO);

    await page.getByRole('button', { name: 'Підписатися' }).click();

    await expect(page.getByTestId('message')).toHaveClass(/success/);

    await page.goto('/subscriptions');

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'API Key' }).fill(API_KEY);

    await page.getByRole('button', { name: 'Пошук' }).click();

    await expect(page.getByTestId('resultsHeader')).toContainText('Знайдено: 1 підписок');
    await expect(page.getByTestId('badge-pending')).toContainText('Очікує підтвердження');
  });
});
