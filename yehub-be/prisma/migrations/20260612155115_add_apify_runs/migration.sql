-- CreateTable
CREATE TABLE "apify_runs" (
    "id" UUID NOT NULL,
    "apify_run_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "campaign_id" UUID,
    "post_id" UUID,
    "social_account_id" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "run_time_secs" DOUBLE PRECISION,
    "compute_units" DOUBLE PRECISION,
    "usage_total_usd" DOUBLE PRECISION,
    "usage_usd" JSONB,
    "usage_finalized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apify_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apify_runs_apify_run_id_key" ON "apify_runs"("apify_run_id");

-- CreateIndex
CREATE INDEX "apify_runs_campaign_id_started_at_idx" ON "apify_runs"("campaign_id", "started_at");

-- CreateIndex
CREATE INDEX "apify_runs_post_id_idx" ON "apify_runs"("post_id");

-- CreateIndex
CREATE INDEX "apify_runs_social_account_id_idx" ON "apify_runs"("social_account_id");

-- AddForeignKey
ALTER TABLE "apify_runs" ADD CONSTRAINT "apify_runs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apify_runs" ADD CONSTRAINT "apify_runs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apify_runs" ADD CONSTRAINT "apify_runs_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
