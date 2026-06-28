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
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Gender } from '../../../generated/prisma/client';
import { PHONE_REGEX, PHONE_ERROR_MESSAGE } from './phone-validation';

export class UpdateProfileDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiPropertyOptional({ example: 'john@example.com', nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ example: '+84123456789', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(PHONE_REGEX, { message: PHONE_ERROR_MESSAGE })
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'S3 key for the avatar image; pass null to clear',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  avatar?: string | null;

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
}
