import { describe, it, expect } from 'vitest';
import { SubscribeSchema } from '../dtos/subscription.dto';
describe('SubscribeSchema Validation', () => {
  it('повинен успішно валідувати правильні дані', () => {
    const validData = {
      email: 'test@example.com',
      repo: 'facebook/react',
    };

    const result = SubscribeSchema.safeParse(validData);

    expect(result.success).toBe(true);
  });

  it('повинен повертати помилку для неправильного email', () => {
    const invalidData = {
      email: 'not-an-email',
      repo: 'facebook/react',
    };

    const result = SubscribeSchema.safeParse(invalidData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Неправильний формат email адреси');
    }
  });

  it('повинен повертати помилку для неправильного формату репозиторію', () => {
    const invalidData = {
      email: 'test@example.com',
      repo: 'just-repo-name',
    };

    const result = SubscribeSchema.safeParse(invalidData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Використовуй 'owner/repo'");
    }
  });

  it('повинен повертати помилку, якщо дані відсутні', () => {
    const emptyData = {};

    const result = SubscribeSchema.safeParse(emptyData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBe(2);
    }
  });
});
