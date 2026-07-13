import { test as base } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

// ---- types ----

type DbFixtures = {
  prisma: PrismaClient;
  uniqueEmail: string;
  createPendingSubscription: (
    overrides?: Partial<{
      email: string;
      repository: string;
      confirmToken: string;
      unsubscribeToken: string;
    }>,
  ) => Promise<{ id: string; confirmToken: string; unsubscribeToken: string; repository: string }>;
  createActiveSubscription: (
    overrides?: Partial<{
      email: string;
      repository: string;
      confirmToken: string;
      unsubscribeToken: string;
    }>,
  ) => Promise<{ id: string; confirmToken: string; unsubscribeToken: string; repository: string }>;
  waitForDbState: (check: () => Promise<boolean>, timeout?: number) => Promise<void>;
};

// ---- extended test ----

export const test = base.extend<DbFixtures>({
  prisma: async ({}, use) => {
    await use(prisma);
  },

  uniqueEmail: async ({}, use) => {
    const email = `e2e-${Date.now()}@example.com`;
    await use(email);
  },

  createPendingSubscription: async ({ prisma, uniqueEmail }, use) => {
    const created: string[] = [];

    await use(async (overrides = {}) => {
      const sub = await prisma.subscription.create({
        data: {
          email: uniqueEmail,
          repository: 'facebook/react',
          status: 'PENDING',
          confirmToken: `confirm-${Date.now()}`,
          unsubscribeToken: `unsub-${Date.now()}`,
          ...overrides,
        },
      });
      created.push(sub.id);

      return sub;
    });

    await prisma.subscription.deleteMany({ where: { id: { in: created } } });
  },

  createActiveSubscription: async ({ prisma, uniqueEmail }, use) => {
    const created: string[] = [];

    await use(async (overrides = {}) => {
      const sub = await prisma.subscription.create({
        data: {
          email: uniqueEmail,
          repository: 'facebook/react',
          status: 'ACTIVE',
          confirmToken: `confirm-active-${Date.now()}`,
          unsubscribeToken: `unsub-active-${Date.now()}`,
          ...overrides,
        },
      });
      created.push(sub.id);

      return sub;
    });

    await prisma.subscription.deleteMany({ where: { id: { in: created } } });
  },

  waitForDbState: async ({}, use) => {
    await use(async (check: () => Promise<boolean>, timeout = 5000) => {
      const start = Date.now();

      while (Date.now() - start < timeout) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 100));
      }

      throw new Error(`waitForDbState: timeout after ${timeout}ms`);
    });
  },
});

export { expect } from '@playwright/test';
