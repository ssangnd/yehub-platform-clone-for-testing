-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "last_polled_at" TIMESTAMP(3),
ADD COLUMN     "last_poll_status" TEXT;
