import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { type ZodTypeAny } from 'zod';

// Pipe que valida body/query/params contra un schema Zod compartido.
// CLAUDE.md §8 — usamos Zod tanto en backend como en frontend (mismas reglas).
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Devolvemos errores en formato amigable, agrupados por campo
      const fieldErrors = result.error.flatten().fieldErrors;
      throw new BadRequestException({
        message: 'Datos inválidos',
        errors: fieldErrors,
      });
    }
    return result.data;
  }
}
