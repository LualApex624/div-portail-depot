import { z } from 'zod';

export const completeUploadSchema = z.object({
  fileId: z.string().min(1).max(64),
});

export type CompleteUploadDto = z.infer<typeof completeUploadSchema>;
