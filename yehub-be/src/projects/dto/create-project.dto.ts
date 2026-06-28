import {
  IsString,
  IsOptional,
  IsUrl,
  MinLength,
  MaxLength,
  IsArray,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  client_name?: string;

  @ApiPropertyOptional({ description: 'S3 URL of project logo' })
  @IsUrl({ require_tld: false })
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Category UUIDs to connect',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  category_ids?: string[];
}
