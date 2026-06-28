import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { Platform } from '../../../generated/prisma/client';

export class LinkAccountDto {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform!: Platform;

  @ApiProperty({ example: 'johndoe' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'facebook_johndoe' })
  @IsOptional()
  @IsString()
  platformUserId?: string;
}
