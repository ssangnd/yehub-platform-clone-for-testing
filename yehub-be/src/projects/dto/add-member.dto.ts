import { IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '../../../generated/prisma/client';

export class AddMemberDto {
  @ApiProperty()
  @IsUUID()
  user_id!: string;

  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
