-- Ensure campaign_objectives join rows are removed when either side is deleted.
-- The Prisma schema already declares this; this migration repairs existing
-- databases whose constraints were created without ON DELETE CASCADE.

ALTER TABLE "campaign_objectives"
  DROP CONSTRAINT IF EXISTS "campaign_objectives_campaign_id_fkey";

ALTER TABLE "campaign_objectives"
  ADD CONSTRAINT "campaign_objectives_campaign_id_fkey"
  FOREIGN KEY ("campaign_id")
  REFERENCES "campaigns"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "campaign_objectives"
  DROP CONSTRAINT IF EXISTS "campaign_objectives_objective_id_fkey";

ALTER TABLE "campaign_objectives"
  ADD CONSTRAINT "campaign_objectives_objective_id_fkey"
  FOREIGN KEY ("objective_id")
  REFERENCES "global_campaign_objectives"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
