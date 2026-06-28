import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PollingModule } from '../polling/polling.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [AuthModule, PollingModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
