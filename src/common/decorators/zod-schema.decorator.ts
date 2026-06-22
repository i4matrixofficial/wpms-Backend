import { UsePipes } from '@nestjs/common';
import { ZodType } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

// usage: @ZodBody(LoginSchema)  on a controller method
export const ZodBody = (schema: ZodType) =>
  UsePipes(new ZodValidationPipe(schema));
