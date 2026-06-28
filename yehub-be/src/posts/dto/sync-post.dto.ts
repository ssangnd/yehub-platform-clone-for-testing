import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class SyncPostDto {
  @ApiPropertyOptional({
    description: 'Queue an immediate metric poll. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  metrics?: boolean;

  @ApiPropertyOptional({
    description: 'Queue an immediate comment poll. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  comments?: boolean;
}
