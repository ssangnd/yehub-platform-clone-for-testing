-- ─── Projects ────────────────────────────────────────────────────────

CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "client_name" VARCHAR(100),
    "logo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_active_idx" ON "projects"("active");

-- ─── Global Project Categories ───────────────────────────────────────

CREATE TABLE "global_project_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_project_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "global_project_categories_name_key" ON "global_project_categories"("name");

-- ─── Project ↔ Category (join table) ─────────────────────────────────

CREATE TABLE "project_categories" (
    "project_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "project_categories_pkey" PRIMARY KEY ("project_id","category_id")
);

CREATE INDEX "project_categories_category_id_idx" ON "project_categories"("category_id");

ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "global_project_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Project Memberships ─────────────────────────────────────────────

CREATE TABLE "project_memberships" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "role" "project_role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("user_id","project_id")
);

CREATE INDEX "project_memberships_project_id_idx" ON "project_memberships"("project_id");

ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
