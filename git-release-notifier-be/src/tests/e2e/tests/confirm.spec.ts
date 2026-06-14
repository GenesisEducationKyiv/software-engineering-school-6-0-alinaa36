import { test, expect } from '../fixtures/base.fixture';

test.describe('Підтвердження підписки', () => {
  test('підтвердження підписки — показує сторінку успіху з назвою репозиторію та оновлює БД', async ({
    page,
    prisma,
    createPendingSubscription,
    waitForDbState,
  }) => {
    // Arrange
    const sub = await createPendingSubscription({ repository: 'facebook/react' });

    // Act
    await page.goto(`/confirm/${sub.confirmToken}`);

    // Assert — UI
    await expect(page.locator('h1')).toContainText('Підписку підтверджено!');
    await expect(page.getByTestId('repo-name')).toContainText('facebook/react');

    // Assert — БД
    await waitForDbState(async () => {
      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });

      return updated?.status === 'ACTIVE';
    });

    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(updated?.status).toBe('ACTIVE');
  });

  test('не змінює статус інших підписок', async ({
    page,
    prisma,
    uniqueEmail,
    createPendingSubscription,
    waitForDbState,
  }) => {
    // Arrange
    const sub1 = await createPendingSubscription({
      email: uniqueEmail,
      repository: 'facebook/react',
      confirmToken: `confirm-1-${Date.now()}`,
      unsubscribeToken: `unsub-1-${Date.now()}`,
    });
    const sub2 = await createPendingSubscription({
      email: `other-${uniqueEmail}`,
      repository: 'vuejs/vue',
      confirmToken: `confirm-2-${Date.now()}`,
      unsubscribeToken: `unsub-2-${Date.now()}`,
    });

    // Act
    await page.goto(`/confirm/${sub1.confirmToken}`);

    await waitForDbState(async () => {
      const updated = await prisma.subscription.findUnique({ where: { id: sub1.id } });

      return updated?.status === 'ACTIVE';
    });

    // Assert
    const untouched = await prisma.subscription.findUnique({ where: { id: sub2.id } });
    expect(untouched?.status).toBe('PENDING');
  });
});
