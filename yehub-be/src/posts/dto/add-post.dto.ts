import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class AddPostDto {
  @ApiProperty({ example: 'https://www.instagram.com/p/ABC123/' })
  @IsUrl()
  url!: string;
}
