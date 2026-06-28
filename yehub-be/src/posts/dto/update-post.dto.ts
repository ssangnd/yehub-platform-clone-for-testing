import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional } from 'class-validator';
import { POLLING_INTERVAL_OPTIONS } from '../../polling/polling.constants';

export class UpdatePostSettingsDto {
  @ApiProperty({
    example: 3600,
    description:
      'Metric polling interval in seconds. Use 0 for manual trigger.',
    enum: POLLING_INTERVAL_OPTIONS,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @IsIn(POLLING_INTERVAL_OPTIONS)
  polling_metric_override!: number | null;

  @ApiProperty({
    example: 21600,
    description:
      'Comment polling interval in seconds. Use 0 for manual trigger.',
    enum: POLLING_INTERVAL_OPTIONS,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @IsIn(POLLING_INTERVAL_OPTIONS)
  polling_comment_override!: number | null;

  @ApiProperty({
    description: 'KPI targets JSON (engagement, buzz, interaction, view)',
    example: { engagement: 1000, buzz: 500, interaction: 800, view: 5000 },
  })
  @IsObject()
  kpi_targets!: Record<string, number>;
}
