import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ description: 'Search by project name or client name' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by active status; omit to return all',
  })
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
