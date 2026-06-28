import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKolTierDto {
  @ApiProperty({ description: 'Tier name', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Tier description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Tier color', default: 'blue' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({ description: 'Minimum followers', minimum: 0 })
  @IsInt()
  @Min(0)
  minFollowers!: number;

  @ApiPropertyOptional({
    description: 'Maximum followers (null for unlimited)',
    minimum: 1,
    nullable: true,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxFollowers?: number | null;
}
