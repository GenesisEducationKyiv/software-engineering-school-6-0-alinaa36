import { z } from 'zod';

export const SubscribeSchema = z.object({
  email: z
    .string({ message: "Поле 'email' є обов'язковим" })
    .email({ message: 'Неправильний формат email адреси' }),

  repo: z
    .string({ message: "Поле 'repo' є обов'язковим" })
    .min(1, { message: "Поле 'repo' не може бути порожнім" })
    .regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/, {
      message: "Неправильний формат. Використовуй 'owner/repo' (наприклад: facebook/react)",
    }),
});

export type SubscribeDto = z.infer<typeof SubscribeSchema>;
