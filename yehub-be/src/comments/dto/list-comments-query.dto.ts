import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Platform, Sentiment } from '../../../generated/prisma/client';

export class ListCommentsQueryDto {
  @ApiPropertyOptional({ description: 'Search in comment content' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({ enum: Sentiment })
  @IsOptional()
  @IsEnum(Sentiment)
  sentiment?: Sentiment;

  @ApiPropertyOptional({ description: 'Filter noise/spam comments' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_noise?: boolean;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    default: 'newest',
    enum: ['newest', 'oldest', 'most_likes'],
  })
  @IsOptional()
  @IsString()
  sort?: 'newest' | 'oldest' | 'most_likes';

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
}
