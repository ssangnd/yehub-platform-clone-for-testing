import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAvatarDto {
  @ApiProperty({
    description: 'S3 key for the avatar; null to clear',
    nullable: true,
  })
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @IsOptional()
  avatar!: string | null;
}
