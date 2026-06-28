import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CampaignStatus } from '../../../generated/prisma/client';

export class ChangeCampaignStatusDto {
  @ApiProperty({ enum: CampaignStatus })
  @IsEnum(CampaignStatus)
  status!: CampaignStatus;
}
