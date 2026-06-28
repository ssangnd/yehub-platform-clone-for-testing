import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { PollingSchedulerService } from './polling-scheduler.service';
import { AccountPollingService } from './account-polling.service';

// Enqueue-only polling surface, imported by the API. Provides the scheduler
// (which only talks to BullMQ queues + Prisma) and the queue registrations.
// The Apify scrape adapters live in PollingProcessorModule (worker-only) so
// importing this module does NOT pull Apify config into the API process.
@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.JOB_SCHEDULER },
      { name: QUEUE_NAMES.SCRAPER },
    ),
  ],
  providers: [PollingSchedulerService, AccountPollingService],
  exports: [PollingSchedulerService, AccountPollingService, BullModule],
})
export class PollingModule {}
