import { test, expect } from '../fixtures/base.fixture';

test.describe('Відписка', () => {
  test('відписка — показує сторінку успіху з репозиторієм, видаляє запис з БД', async ({
    page,
    prisma,
    createActiveSubscription,
    waitForDbState,
  }) => {
    // Arrange
    const sub = await createActiveSubscription({ repository: 'facebook/react' });

    // Act
    await page.goto(`/api/unsubscribe/${sub.unsubscribeToken}`);

    // Assert — UI
    await expect(page.locator('h1')).toContainText('Відписку підтверджено');
    await expect(page.getByTestId('repo-name')).toContainText('facebook/react');

    // Assert — БД
    await waitForDbState(async () => {
      const deleted = await prisma.subscription.findUnique({ where: { id: sub.id } });

      return deleted === null;
    });

    const deleted = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(deleted).toBeNull();
  });

  test('не видаляє інші підписки', async ({
    page,
    prisma,
    uniqueEmail,
    createActiveSubscription,
    waitForDbState,
  }) => {
    // Arrange
    const sub1 = await createActiveSubscription({
      email: uniqueEmail,
      repository: 'facebook/react',
      confirmToken: `confirm-1-${Date.now()}`,
      unsubscribeToken: `unsub-1-${Date.now()}`,
    });
    const sub2 = await createActiveSubscription({
      email: `other-${uniqueEmail}`,
      repository: 'vuejs/vue',
      confirmToken: `confirm-2-${Date.now()}`,
      unsubscribeToken: `unsub-2-${Date.now()}`,
    });

    // Act
    await page.goto(`/api/unsubscribe/${sub1.unsubscribeToken}`);

    await waitForDbState(async () => {
      const deleted = await prisma.subscription.findUnique({ where: { id: sub1.id } });

      return deleted === null;
    });

    // Assert
    const remaining = await prisma.subscription.findUnique({ where: { id: sub2.id } });
    expect(remaining).not.toBeNull();
  });
});
