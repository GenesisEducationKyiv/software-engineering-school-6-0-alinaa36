import { test, expect } from '../fixtures/base.fixture';

const EXISTING_REPO = 'facebook/react';

test.describe('Форма підписки', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('успішна підписка — success message, форма очищається, запис в БД', async ({
    page,
    uniqueEmail,
    prisma,
    waitForDbState,
  }) => {
    // Arrange
    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'Репозиторій' }).fill(EXISTING_REPO);

    // Act
    await page.getByRole('button', { name: 'Підписатися' }).click();

    // Assert — UI
    await expect(page.getByTestId('message')).toHaveClass(/success/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Репозиторій' })).toHaveValue('');

    // Assert — БД
    await waitForDbState(async () => {
      const sub = await prisma.subscription.findFirst({
        where: { email: uniqueEmail, repository: EXISTING_REPO },
      });

      return sub !== null;
    });

    const sub = await prisma.subscription.findFirst({
      where: { email: uniqueEmail, repository: EXISTING_REPO },
    });
    expect(sub).not.toBeNull();
    expect(sub?.status).toBe('PENDING');
  });

  test('показує error message при повторній підписці', async ({
    page,
    uniqueEmail,
    createActiveSubscription,
  }) => {
    // Arrange
    await createActiveSubscription({ email: uniqueEmail, repository: EXISTING_REPO });

    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'Репозиторій' }).fill(EXISTING_REPO);

    // Act
    await page.getByRole('button', { name: 'Підписатися' }).click();

    // Assert
    await expect(page.getByTestId('message')).toHaveClass(/error/);
  });

  test('показує error message для неіснуючого репозиторію на GitHub', async ({
    page,
    uniqueEmail,
  }) => {
    // Arrange
    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail);
    await page
      .getByRole('textbox', { name: 'Репозиторій' })
      .fill('this-org-does-not-exist-xyz/no-such-repo-abc');

    // Act
    await page.getByRole('button', { name: 'Підписатися' }).click();

    // Assert
    await expect(page.getByTestId('message')).toHaveClass(/error/);
  });
});
