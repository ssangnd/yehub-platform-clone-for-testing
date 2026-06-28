import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEmail,
  IsEnum,
  IsArray,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender, Platform } from '../../../generated/prisma/client';
import { PHONE_REGEX, PHONE_ERROR_MESSAGE } from './phone-validation';

export class SocialAccountInput {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform!: Platform;

  @ApiProperty({ example: 'https://facebook.com/johndoe' })
  @IsString()
  @IsNotEmpty()
  url!: string;
}

export class CreateProfileDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+84123456789' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_REGEX, { message: PHONE_ERROR_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({ description: 'S3 key for the avatar image' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: ['fashion', 'beauty'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  tierId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one category is required' })
  @IsUUID('4', { each: true })
  categoryIds!: string[];

  @ApiPropertyOptional({ type: [SocialAccountInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialAccountInput)
  socialAccounts?: SocialAccountInput[];
}
