import { z } from 'zod';

export const releaseDeliveredSchema = z.object({
  email: z.string().email(),
  repo: z.string(),
  tag: z.string(),
});

export type ReleaseDeliveredEvent = z.infer<typeof releaseDeliveredSchema>;
