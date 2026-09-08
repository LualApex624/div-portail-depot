import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Validation des entrees par schema Zod.
 *
 * Choisi plutot que class-validator : le schema est aussi la source du type
 * TypeScript du DTO, il n'y a donc pas de derive possible entre les deux.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join(', ');
      throw new BadRequestException(message);
    }

    return result.data;
  }
}
