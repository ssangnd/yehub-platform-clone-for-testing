import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get a presigned URL to upload an image to S3' })
  async getUploadUrl(@Body() dto: PresignedUploadDto) {
    return this.uploadsService.generateUploadUrl(dto.contentType, dto.fileName);
  }

  @Get('presigned-url')
  @ApiOperation({
    summary: 'Get a presigned URL to download/view an image from S3',
  })
  @ApiQuery({ name: 'key', required: true, description: 'S3 object key' })
  async getDownloadUrl(@Query('key') key: string) {
    return this.uploadsService.generateDownloadUrl(key);
  }
}
