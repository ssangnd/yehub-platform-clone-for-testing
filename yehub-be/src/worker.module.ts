import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { LoggerModule } from 'nestjs-pino';
import * as PinoPretty from 'pino-pretty';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { PollingProcessorModule } from './polling/polling-processor.module';
import { workerValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: workerValidationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        stream: PinoPretty.default({
          singleLine: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          messageFormat: '[worker] [{context}] {msg}',
          ignore: 'pid,hostname,context',
        }),
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [createKeyv(process.env.REDIS_URL)],
      }),
    }),
    PrismaModule,
    QueueModule,
    PollingProcessorModule,
  ],
  providers: [AppService],
})
export class WorkerModule {}
