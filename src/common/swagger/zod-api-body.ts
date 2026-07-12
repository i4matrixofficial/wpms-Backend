import { ApiBody } from '@nestjs/swagger';
import * as z from 'zod';
import { ZodType } from 'zod';

export const ZodApiBody = (schema: ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, { target: 'openapi-3.0' }) as any,
  });
