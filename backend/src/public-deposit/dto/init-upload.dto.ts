import { z } from 'zod';

export const initUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  size: z.number().int().positive(),
});

export type InitUploadDto = z.infer<typeof initUploadSchema>;
