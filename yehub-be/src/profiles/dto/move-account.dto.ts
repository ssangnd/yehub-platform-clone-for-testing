import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MoveAccountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  targetProfileId!: string;
}
