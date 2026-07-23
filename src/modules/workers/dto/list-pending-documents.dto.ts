import { z } from 'zod';

export const ListPendingDocumentsSchema = z.object({
  workerId: z.uuid().optional().meta({
    description:
      'Scope the queue down to one worker (resolve via GET /workers/by-user/:userId if you only have a userId)',
  }),
});
export type ListPendingDocumentsDto = z.infer<
  typeof ListPendingDocumentsSchema
>;
