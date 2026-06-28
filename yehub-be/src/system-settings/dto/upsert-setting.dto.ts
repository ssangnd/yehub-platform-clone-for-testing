import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SystemSettingType } from '../../../generated/prisma/client';

export class UpsertSettingDto {
  @ApiProperty({ enum: SystemSettingType })
  @IsEnum(SystemSettingType)
  type!: SystemSettingType;

  @ApiProperty({ required: false, nullable: true })
  @ValidateIf((o: UpsertSettingDto) => o.type === SystemSettingType.TEXT)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  value_text?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @ValidateIf((o: UpsertSettingDto) => o.type === SystemSettingType.BOOLEAN)
  @IsOptional()
  @IsBoolean()
  value_boolean?: boolean | null;

  @ApiProperty({ required: false, nullable: true })
  @ValidateIf((o: UpsertSettingDto) => o.type === SystemSettingType.NUMBER)
  @IsOptional()
  @IsNumber()
  value_number?: number | null;
}
