import { z } from 'zod';

/** Durees proposees par l'UI : 24 h, 48 h, 72 h, 7 jours. */
export const ALLOWED_EXPIRATIONS_HOURS = [24, 48, 72, 168] as const;

export const createRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  expiresInHours: z
    .number()
    .int()
    .refine(
      (value) => (ALLOWED_EXPIRATIONS_HOURS as readonly number[]).includes(value),
      `La duree doit valoir ${ALLOWED_EXPIRATIONS_HOURS.join(', ')} heures.`,
    ),
});

export type CreateRequestDto = z.infer<typeof createRequestSchema>;
