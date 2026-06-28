import { Module } from '@nestjs/common';
// import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { createKeyv } from '@keyv/redis';
import { LoggerModule } from 'nestjs-pino';
import * as PinoPretty from 'pino-pretty';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';
import { ProjectsModule } from './projects/projects.module';
import { CategoriesModule } from './categories/categories.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CostModule } from './cost/cost.module';
import { ObjectivesModule } from './objectives/objectives.module';
import { PostsModule } from './posts/posts.module';
import { CommentsModule } from './comments/comments.module';
import { KolCategoriesModule } from './kol-categories/kol-categories.module';
import { KolTiersModule } from './kol-tiers/kol-tiers.module';
import { ProfilesModule } from './profiles/profiles.module';
import { UploadsModule } from './uploads/uploads.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { PollingModule } from './polling/polling.module';
import { apiValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: apiValidationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Use stream instead of transport to avoid worker thread module resolution issues in Docker
        stream: PinoPretty.default({
          singleLine: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          messageFormat: '[{context}] {msg}',
          ignore: 'pid,hostname,context',
        }),
        redact: ['req.headers.authorization', 'req.body.password'],
        serializers: {
          req: (req: { method: string; url: string; query: unknown }) => ({
            method: req.method,
            url: req.url,
            query: req.query,
          }),
          res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [createKeyv(process.env.REDIS_URL)],
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
    PrismaModule,
    QueueModule,
    AuthModule,
    MailModule,
    AdminModule,
    ProjectsModule,
    CategoriesModule,
    CampaignsModule,
    CostModule,
    ObjectivesModule,
    PostsModule,
    CommentsModule,
    KolCategoriesModule,
    KolTiersModule,
    ProfilesModule,
    UploadsModule,
    SystemSettingsModule,
    PollingModule,
  ],
  controllers: [AppController],
  // DO NOT re-enable ThrottlerGuard until the project owner explicitly requests it.
  // providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
  providers: [AppService],
})
export class AppModule {}
