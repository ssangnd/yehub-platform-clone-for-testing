import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Platform } from '../../../generated/prisma/client';

// Splits a comma-separated query param ("A,B") into a trimmed, non-empty array.
// Already-array input (repeated params) is passed through unchanged.
function csvToArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length ? parts : undefined;
}

export class CostQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsNotEmpty()
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsNotEmpty()
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ type: String, example: 'INSTAGRAM,TIKTOK' })
  @IsOptional()
  @Transform(({ value }) => csvToArray(value))
  @IsArray()
  @IsEnum(Platform, { each: true })
  platforms?: Platform[];

  @ApiPropertyOptional({ type: String, example: 'uuid1,uuid2' })
  @IsOptional()
  @Transform(({ value }) => csvToArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  project_ids?: string[];

  @ApiPropertyOptional({ type: String, example: 'uuid1,uuid2' })
  @IsOptional()
  @Transform(({ value }) => csvToArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  campaign_ids?: string[];
}
