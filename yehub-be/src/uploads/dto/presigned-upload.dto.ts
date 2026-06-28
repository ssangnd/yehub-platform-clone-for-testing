import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export class PresignedUploadDto {
  @ApiProperty({
    example: 'image/png',
    enum: ALLOWED_IMAGE_TYPES,
    description: 'MIME type of the image to upload',
  })
  @IsIn([...ALLOWED_IMAGE_TYPES], {
    message: `contentType must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
  })
  contentType!: AllowedImageType;

  @ApiProperty({ example: 'avatar.png' })
  @IsString()
  @MinLength(1)
  fileName!: string;
}
