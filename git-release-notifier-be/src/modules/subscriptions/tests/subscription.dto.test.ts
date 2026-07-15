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
    if (result.success) {
      expect(result.data).toEqual(validData);
    }
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
      expect(result.error.issues[0].message).toBe(
        "Неправильний формат. Використовуй 'owner/repo' (наприклад: facebook/react)",
      );
    }
  });

  it('повинен повертати помилку, якщо дані відсутні', () => {
    const emptyData = {};

    const result = SubscribeSchema.safeParse(emptyData);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Поле 'email' є обов'язковим");
      expect(messages).toContain("Поле 'repo' є обов'язковим");
    }
  });

  it('повинен повертати кастомне повідомлення якщо email відсутній', () => {
    const dataWithoutEmail = { repo: 'owner/repo' };

    const result = SubscribeSchema.safeParse(dataWithoutEmail);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Поле 'email' є обов'язковим");
    }
  });

  it('повинен повертати кастомне повідомлення якщо repo відсутній', () => {
    const dataWithoutRepo = { email: 'test@example.com' };

    const result = SubscribeSchema.safeParse(dataWithoutRepo);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Поле 'repo' є обов'язковим");
    }
  });

  it('повинен відхиляти порожній рядок repo', () => {
    const dataWithEmptyRepo = { email: 'test@example.com', repo: '' };

    const result = SubscribeSchema.safeParse(dataWithEmptyRepo);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Поле 'repo' не може бути порожнім");
    }
  });

  it('повинен відхиляти repo без назви після слешу', () => {
    const dataWithTrailingSlash = { email: 'test@example.com', repo: 'owner/' };

    const result = SubscribeSchema.safeParse(dataWithTrailingSlash);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Неправильний формат. Використовуй 'owner/repo' (наприклад: facebook/react)",
      );
    }
  });

  it('повинен відхиляти repo без owner перед слешем', () => {
    const dataWithLeadingSlash = { email: 'test@example.com', repo: '/repo' };

    const result = SubscribeSchema.safeParse(dataWithLeadingSlash);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Неправильний формат. Використовуй 'owner/repo' (наприклад: facebook/react)",
      );
    }
  });

  it('повинен приймати repo з крапкою в назві', () => {
    const dataWithDot = { email: 'test@example.com', repo: 'owner/repo.js' };

    const result = SubscribeSchema.safeParse(dataWithDot);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(dataWithDot);
    }
  });

  it('повинен приймати repo з підкресленням та дефісом', () => {
    const dataWithSpecialChars = { email: 'test@example.com', repo: 'my-org/my_repo' };

    const result = SubscribeSchema.safeParse(dataWithSpecialChars);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(dataWithSpecialChars);
    }
  });
});
