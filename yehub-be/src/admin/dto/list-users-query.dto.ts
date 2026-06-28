import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GlobalRole, UserStatus } from '../../../generated/prisma/client';

function toArray(value: unknown): unknown[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as unknown[];
  return [value];
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['name', 'role', 'last_login_at'],
  })
  @IsString()
  @IsIn(['name', 'role', 'last_login_at'])
  @IsOptional()
  sortBy?: 'name' | 'role' | 'last_login_at';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsString()
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Search query matching name or email (case-insensitive)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by one or more global roles',
    enum: GlobalRole,
    isArray: true,
  })
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @IsEnum(GlobalRole, { each: true })
  @IsOptional()
  role?: GlobalRole[];

  @ApiPropertyOptional({
    description: 'Filter by one or more user statuses',
    enum: UserStatus,
    isArray: true,
  })
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @IsEnum(UserStatus, { each: true })
  @IsOptional()
  status?: UserStatus[];
}
