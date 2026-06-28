import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsDateString,
  IsIn,
  IsArray,
  IsEnum,
  IsUUID,
  ArrayMinSize,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Platform } from '../../../generated/prisma/client';
import { POLLING_INTERVAL_OPTIONS } from '../../polling/polling.constants';

@ValidatorConstraint({ name: 'IsBeforeEndDate', async: false })
class IsBeforeEndDateConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const obj = args.object as CreateCampaignDto;
    return new Date(obj.start_date) < new Date(obj.end_date);
  }

  defaultMessage() {
    return 'start_date must be before end_date';
  }
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'Vinamilk Q2 Campaign' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  start_date!: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  @Validate(IsBeforeEndDateConstraint)
  end_date!: string;

  @ApiPropertyOptional({
    example: 3600,
    description: 'Metric polling interval in seconds. Use 0 for manual.',
    enum: POLLING_INTERVAL_OPTIONS,
  })
  @IsOptional()
  @IsIn(POLLING_INTERVAL_OPTIONS)
  metric_polling_interval?: number;

  @ApiPropertyOptional({
    example: 21600,
    description: 'Comments polling interval in seconds. Use 0 for manual.',
    enum: POLLING_INTERVAL_OPTIONS,
  })
  @IsOptional()
  @IsIn(POLLING_INTERVAL_OPTIONS)
  comments_polling_interval?: number;

  @ApiPropertyOptional({
    example: ['posts', 'comments', 'engagement'],
    description: 'Display metrics keys',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  display_metrics?: string[];

  @ApiProperty({ enum: Platform, isArray: true })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one platform is required' })
  @IsEnum(Platform, { each: true })
  platforms!: Platform[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  objective_ids?: string[];
}
