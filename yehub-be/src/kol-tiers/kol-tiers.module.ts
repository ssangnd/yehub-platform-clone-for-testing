import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KolTiersController } from './kol-tiers.controller';
import { KolTiersService } from './kol-tiers.service';

@Module({
  imports: [AuthModule],
  controllers: [KolTiersController],
  providers: [KolTiersService],
  exports: [KolTiersService],
})
export class KolTiersModule {}
