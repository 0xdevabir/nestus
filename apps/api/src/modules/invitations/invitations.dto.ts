import { createZodDto } from 'nestjs-zod';
import { createInvitationSchema } from '@nestus/shared';

export class CreateInvitationDto extends createZodDto(createInvitationSchema) {}
