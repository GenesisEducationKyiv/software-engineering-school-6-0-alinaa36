import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from './config/env.config';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.db.url }),
});

export async function runMigrations(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    -- Prisma застосовує міграції через migrate deploy
    -- Цей файл потрібен для тестів
  `);
}
