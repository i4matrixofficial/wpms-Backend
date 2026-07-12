import { ApiBody } from '@nestjs/swagger';
import * as z from 'zod';
import { ZodType } from 'zod';

export const ZodApiBody = (schema: ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, {
      target: 'openapi-3.0',
      unrepresentable: 'any', // ← dates (and other JS-only types) render as "any" instead of throwing
    }) as any,
  });
