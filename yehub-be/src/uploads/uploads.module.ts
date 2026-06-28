import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadsController } from './uploads.controller';
import { UploadsCoreModule } from './uploads-core.module';

@Module({
  imports: [AuthModule, UploadsCoreModule],
  controllers: [UploadsController],
  exports: [UploadsCoreModule],
})
export class UploadsModule {}
