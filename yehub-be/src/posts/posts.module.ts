import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PollingModule } from '../polling/polling.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [AuthModule, PollingModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
