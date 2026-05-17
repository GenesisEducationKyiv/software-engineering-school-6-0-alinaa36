import { test, expect } from '../fixtures/base.fixture';

const EXISTING_REPO = 'facebook/react';
const API_KEY =
  process.env.API_KEY ??
  (() => {
    throw new Error('API_KEY not set');
  })();

test.describe('Сторінка підписок', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/subscriptions');
  });

  test('показує підписки з правильними badge для кожного статусу', async ({
    page,
    uniqueEmail,
    createActiveSubscription,
    createPendingSubscription,
  }) => {
    // Arrange
    await createActiveSubscription({
      email: uniqueEmail,
      repository: EXISTING_REPO,
      confirmToken: `confirm-active-${Date.now()}`,
      unsubscribeToken: `unsub-active-${Date.now()}`,
    });
    await createPendingSubscription({
      email: uniqueEmail,
      repository: 'vuejs/vue',
      confirmToken: `confirm-pending-${Date.now()}`,
      unsubscribeToken: `unsub-pending-${Date.now()}`,
    });

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'API Key' }).fill(API_KEY);

    // Act
    await page.getByRole('button', { name: 'Пошук' }).click();

    // Assert
    await expect(page.getByTestId('badge-active')).toContainText('Активна');
    await expect(page.getByTestId('badge-pending')).toContainText('Очікує підтвердження');
    await expect(page.getByTestId('resultsHeader')).toContainText('Знайдено: 2 підписок');
  });

  test('показує "Підписок не знайдено" якщо підписок немає', async ({ page, uniqueEmail }) => {
    // Arrange
    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'API Key' }).fill(API_KEY);

    // Act
    await page.getByRole('button', { name: 'Пошук' }).click();

    // Assert
    await expect(page.getByTestId('empty')).toBeVisible();
    await expect(page.getByTestId('empty')).toContainText('Підписок не знайдено');
  });

  test('показує error message при невалідному API key', async ({ page, uniqueEmail }) => {
    // Arrange
    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'API Key' }).fill('wrong-api-key');

    // Act
    await page.getByRole('button', { name: 'Пошук' }).click();

    // Assert
    await expect(page.getByTestId('message')).toHaveClass(/error/);
  });
});
