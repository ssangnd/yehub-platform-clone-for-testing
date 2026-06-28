import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GetCampaignNonMembersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Max results to return', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
