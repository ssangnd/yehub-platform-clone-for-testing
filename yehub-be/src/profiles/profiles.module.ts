import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PollingModule } from '../polling/polling.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuthModule, PollingModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
