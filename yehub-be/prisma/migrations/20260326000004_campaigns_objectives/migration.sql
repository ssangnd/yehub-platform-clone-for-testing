-- ─── Campaigns ───────────────────────────────────────────────────────

CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "platforms" "Platform"[] DEFAULT ARRAY[]::"Platform"[],
    "metric_polling_interval" INTEGER,
    "comments_polling_interval" INTEGER,
    "display_metrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaigns_project_id_idx" ON "campaigns"("project_id");
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Global Campaign Objectives ──────────────────────────────────────

CREATE TABLE "global_campaign_objectives" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_campaign_objectives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "global_campaign_objectives_name_key" ON "global_campaign_objectives"("name");

-- ─── Campaign ↔ Objective (join table) ───────────────────────────────

CREATE TABLE "campaign_objectives" (
    "campaign_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,

    CONSTRAINT "campaign_objectives_pkey" PRIMARY KEY ("campaign_id","objective_id")
);

CREATE INDEX "campaign_objectives_objective_id_idx" ON "campaign_objectives"("objective_id");

ALTER TABLE "campaign_objectives" ADD CONSTRAINT "campaign_objectives_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_objectives" ADD CONSTRAINT "campaign_objectives_objective_id_fkey"
    FOREIGN KEY ("objective_id") REFERENCES "global_campaign_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Campaign Memberships ────────────────────────────────────────────

CREATE TABLE "campaign_memberships" (
    "user_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "role" "project_role" NOT NULL,
    "added_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_memberships_pkey" PRIMARY KEY ("user_id","campaign_id")
);

CREATE INDEX "campaign_memberships_campaign_id_idx" ON "campaign_memberships"("campaign_id");

ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_added_by_fkey"
    FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
