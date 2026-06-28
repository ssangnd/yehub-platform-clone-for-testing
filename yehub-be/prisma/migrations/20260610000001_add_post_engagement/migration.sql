-- Engagement = total interactions on a post (likes + shares + comments).
-- Stored so it can be sorted/filtered in the database instead of in memory.

ALTER TABLE "posts"
  ADD COLUMN "engagement" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from their current metrics.
UPDATE "posts"
  SET "engagement" = "likes" + "shares" + "comment_count";

CREATE INDEX "posts_engagement_idx" ON "posts"("engagement");

-- Keep engagement in sync whenever metrics change. Only fires BEFORE UPDATE:
-- on INSERT a post has no metrics yet, so the column default of 0 is correct.
CREATE OR REPLACE FUNCTION "posts_set_engagement"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."engagement" := NEW."likes" + NEW."shares" + NEW."comment_count";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "posts_set_engagement_before_update"
  BEFORE UPDATE ON "posts"
  FOR EACH ROW
  EXECUTE FUNCTION "posts_set_engagement"();
