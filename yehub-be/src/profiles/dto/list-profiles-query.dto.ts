import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export type ProfileSortField = 'name' | 'totalFollowers' | 'createdAt';

export class ListProfilesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated KOL category UUIDs',
  })
  @IsOptional()
  @IsString()
  categoryIds?: string;

  @ApiPropertyOptional({ description: 'Comma-separated tier UUIDs' })
  @IsOptional()
  @IsString()
  tierIds?: string;

  @ApiPropertyOptional({ description: 'Comma-separated platforms' })
  @IsOptional()
  @IsString()
  platforms?: string;

  @ApiPropertyOptional({ description: 'Comma-separated genders' })
  @IsOptional()
  @IsString()
  genders?: string;

  @ApiPropertyOptional({ description: 'Comma-separated tag values' })
  @IsOptional()
  @IsString()
  tags?: string;

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
    enum: ['name', 'totalFollowers', 'createdAt'],
  })
  @IsOptional()
  @IsIn(['name', 'totalFollowers', 'createdAt'])
  sortBy?: ProfileSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
