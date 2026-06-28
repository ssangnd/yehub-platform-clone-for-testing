import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsIn,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Platform } from '../../../generated/prisma/client';

export const POST_SORT_FIELDS = [
  'created_at',
  'likes',
  'comment_count',
  'shares',
  'views',
  'engagement',
] as const;
export type PostSortField = (typeof POST_SORT_FIELDS)[number];

export class ListPostsQueryDto {
  @ApiPropertyOptional({
    description: 'Search by URL, content, author name, or platform_post_id',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({
    description: 'Filter posts by linked social account id(s)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? (value as string[]) : [value as string],
  )
  @IsUUID('4', { each: true })
  social_account_id?: string[];

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
    enum: POST_SORT_FIELDS,
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(POST_SORT_FIELDS)
  sort_by?: PostSortField;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
