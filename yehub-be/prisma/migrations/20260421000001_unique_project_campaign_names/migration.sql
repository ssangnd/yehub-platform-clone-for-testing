-- CreateIndex
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");

-- CreateIndex (partial: ignores soft-deleted campaigns)
CREATE UNIQUE INDEX "campaigns_project_id_name_active_key"
  ON "campaigns"("project_id", "name")
  WHERE "deleted_at" IS NULL;
