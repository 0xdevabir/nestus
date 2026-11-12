import { createZodDto } from 'nestjs-zod';
import { createApiKeySchema } from '@nestus/shared';

export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
