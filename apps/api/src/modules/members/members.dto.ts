import { createZodDto } from 'nestjs-zod';
import { updateMemberSchema } from '@nestus/shared';

export class UpdateMemberDto extends createZodDto(updateMemberSchema) {}
