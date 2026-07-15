import { z } from 'zod';

export const SAGA_CONFIRMATION_REPLY_QUEUE = 'saga.confirmation.reply';

export const confirmationReplySchema = z.object({
  sagaId: z.string().uuid(),
  status: z.enum(['SENT', 'FAILED']),
  reason: z.string().optional(),
});

export type ConfirmationReply = z.infer<typeof confirmationReplySchema>;
