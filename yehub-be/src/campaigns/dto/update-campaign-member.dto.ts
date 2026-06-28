import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '../../../generated/prisma/client';

export class UpdateCampaignMemberDto {
  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
