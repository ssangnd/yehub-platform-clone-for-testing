import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignStatus } from '../../../generated/prisma/client';

export const CAMPAIGN_SORT_FIELDS = [
  'name',
  'created_at',
  'post_count',
] as const;
export type CampaignSortField = (typeof CAMPAIGN_SORT_FIELDS)[number];

export class ListCampaignsQueryDto {
  @ApiPropertyOptional({ description: 'Search by campaign name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: CAMPAIGN_SORT_FIELDS,
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(CAMPAIGN_SORT_FIELDS)
  sort_by?: CampaignSortField;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
