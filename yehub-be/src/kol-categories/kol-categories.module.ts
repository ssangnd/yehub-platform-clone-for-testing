import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KolCategoriesController } from './kol-categories.controller';
import { KolCategoriesService } from './kol-categories.service';

@Module({
  imports: [AuthModule],
  controllers: [KolCategoriesController],
  providers: [KolCategoriesService],
  exports: [KolCategoriesService],
})
export class KolCategoriesModule {}
