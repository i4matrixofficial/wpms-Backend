import { z } from 'zod';

export const SetPayoutAccountSchema = z.object({
  bankName: z.string().min(1).max(100).meta({ description: 'Bank name' }),
  accountHolderName: z
    .string()
    .min(1)
    .max(100)
    .meta({ description: 'Name on the account' }),
  accountNumber: z
    .string()
    .min(4)
    .max(34)
    .meta({ description: 'Bank account number' }),
  branchCode: z
    .string()
    .max(20)
    .optional()
    .meta({ description: 'Branch code, if applicable' }),
});
export type SetPayoutAccountDto = z.infer<typeof SetPayoutAccountSchema>;
