import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  current_password!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/\S/, {
    message: 'new_password must contain at least one non-whitespace character',
  })
  new_password!: string;
}
