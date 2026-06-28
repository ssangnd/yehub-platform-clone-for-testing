-- Seed default admin user
-- Password: Admin@123! (bcrypt 10 rounds)
-- This admin should be used for initial setup only.
-- After launching, invite new admins and delete this default account.
INSERT INTO "users" (
    "id",
    "email",
    "password_hash",
    "name",
    "role",
    "status",
    "invitation_accepted_at",
    "created_at",
    "updated_at"
) VALUES (
    gen_random_uuid(),
    'admin@yehub.com',
    '$2b$10$BMwRMHLz/1nI8vIpVIz22uBnHRdXedjhOAJdYmo3ILAlcanrEs97W',
    'Default Admin',
    'ADMIN',
    'ACTIVE',
    NOW(),
    NOW(),
    NOW()
) ON CONFLICT ("email") DO NOTHING;
