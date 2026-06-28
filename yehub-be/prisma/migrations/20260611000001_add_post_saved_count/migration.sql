-- saved_count = number of times a post has been saved/bookmarked.
-- Currently only populated for TikTok (its `collectCount`); other platforms
-- report 0. Existing rows default to 0 since no historical value is available;
-- the next metrics poll fills it in.

ALTER TABLE "posts"
  ADD COLUMN "saved_count" INTEGER NOT NULL DEFAULT 0;
