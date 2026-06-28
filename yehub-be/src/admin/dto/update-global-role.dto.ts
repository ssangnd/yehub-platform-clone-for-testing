import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GlobalRole } from '../../../generated/prisma/client';

export class UpdateGlobalRoleDto {
  @ApiProperty({ enum: GlobalRole })
  @IsEnum(GlobalRole)
  role!: GlobalRole;
}
