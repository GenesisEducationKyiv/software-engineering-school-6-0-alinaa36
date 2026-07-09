import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { SubscribeSchema } from '../dtos/subscription.dto';

type Result = z.ZodSafeParseResult<z.infer<typeof SubscribeSchema>>;

function issuesFor(result: Result, field: string): z.core.$ZodIssue[] {
  if (result.success) return [];

  return result.error.issues.filter((issue) => issue.path[0] === field);
}

function codesFor(result: Result, field: string): string[] {
  return issuesFor(result, field).map((issue) => issue.code);
}

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
    expect(codesFor(result, 'email')).toContain('invalid_format');
  });

  it('повинен повертати помилку для неправильного формату репозиторію', () => {
    const invalidData = {
      email: 'test@example.com',
      repo: 'just-repo-name',
    };

    const result = SubscribeSchema.safeParse(invalidData);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'repo')).toContain('invalid_format');
  });

  it('повинен повертати помилку, якщо дані відсутні', () => {
    const emptyData = {};

    const result = SubscribeSchema.safeParse(emptyData);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'email')).toContain('invalid_type');
    expect(codesFor(result, 'repo')).toContain('invalid_type');
  });

  it('повинен повертати кастомне повідомлення якщо email відсутній', () => {
    const dataWithoutEmail = { repo: 'owner/repo' };

    const result = SubscribeSchema.safeParse(dataWithoutEmail);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'email')).toContain('invalid_type');
  });

  it('повинен повертати кастомне повідомлення якщо repo відсутній', () => {
    const dataWithoutRepo = { email: 'test@example.com' };

    const result = SubscribeSchema.safeParse(dataWithoutRepo);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'repo')).toContain('invalid_type');
  });

  it('повинен відхиляти порожній рядок repo', () => {
    const dataWithEmptyRepo = { email: 'test@example.com', repo: '' };

    const result = SubscribeSchema.safeParse(dataWithEmptyRepo);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'repo')).toContain('too_small');
  });

  it('повинен відхиляти repo без назви після слешу', () => {
    const dataWithTrailingSlash = { email: 'test@example.com', repo: 'owner/' };

    const result = SubscribeSchema.safeParse(dataWithTrailingSlash);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'repo')).toContain('invalid_format');
  });

  it('повинен відхиляти repo без owner перед слешем', () => {
    const dataWithLeadingSlash = { email: 'test@example.com', repo: '/repo' };

    const result = SubscribeSchema.safeParse(dataWithLeadingSlash);

    expect(result.success).toBe(false);
    expect(codesFor(result, 'repo')).toContain('invalid_format');
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
