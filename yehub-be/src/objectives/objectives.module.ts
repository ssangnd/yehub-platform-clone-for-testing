import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObjectivesController } from './objectives.controller';
import { ObjectivesService } from './objectives.service';

@Module({
  imports: [AuthModule],
  controllers: [ObjectivesController],
  providers: [ObjectivesService],
})
export class ObjectivesModule {}
