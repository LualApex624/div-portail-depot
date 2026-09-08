import { z } from 'zod';

export const unlockSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{8}$/, 'Le code PIN comporte 8 chiffres.'),
});

export type UnlockDto = z.infer<typeof unlockSchema>;
