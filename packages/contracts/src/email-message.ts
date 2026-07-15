import { z } from 'zod';

export const emailMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('release'),
    idempotencyKey: z.string(),
    email: z.string().email(),
    repo: z.string(),
    tag: z.string(),
    unsubscribeToken: z.string(),
  }),
  z.object({
    type: z.literal('confirmation'),
    idempotencyKey: z.string(),
    email: z.string().email(),
    repo: z.string(),
    confirmToken: z.string(),
    sagaId: z.string().uuid(),
  }),
]);

export type EmailMessage = z.infer<typeof emailMessageSchema>;

export function releaseIdempotencyKey(email: string, repo: string, tag: string): string {
  return `release:${email}:${repo}:${tag}`;
}

export function confirmationIdempotencyKey(
  email: string,
  repo: string,
  confirmToken: string,
): string {
  return `confirmation:${email}:${repo}:${confirmToken}`;
}
