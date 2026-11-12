import { createZodDto } from 'nestjs-zod';
import { createOrgSchema, updateOrgSchema } from '@nestus/shared';

export class CreateOrgDto extends createZodDto(createOrgSchema) {}
export class UpdateOrgDto extends createZodDto(updateOrgSchema) {}
