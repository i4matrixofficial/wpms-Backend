import { z } from 'zod';

export const UploadDocumentSchema = z.object({
  type: z.enum(['nic_front', 'nic_back', 'police_letter', 'proof_of_address']),
  issuedAt: z.string().date().optional(), // ISO date string, for the 3-month rule
});
export type UploadDocumentDto = z.infer<typeof UploadDocumentSchema>;
