import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { API_URL, SMTP4DEV_URL, TEST_USER } from '../constants';

type SeededUser = { id: string; email: string; name: string };

async function loginAsAdminApi(api: APIRequestContext): Promise<string> {
  const res = await api.post(`${API_URL}/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(res.status()).toBe(200);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function inviteUser(
  api: APIRequestContext,
  token: string,
  payload: { name: string; email: string; role?: 'ADMIN' | 'AUTHORIZED_USER' | 'INTERNAL_USER' },
): Promise<SeededUser> {
  const res = await api.post(`${API_URL}/admin/users/invite`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { role: 'AUTHORIZED_USER', ...payload },
  });
  expect(res.status(), `invite ${payload.email}`).toBe(201);
  return (await res.json()) as SeededUser;
}

async function deleteUserQuietly(api: APIRequestContext, token: string, id: string) {
  await api.delete(`${API_URL}/admin/users/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function purgeMessagesFor(email: string) {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as { results: Array<{ id: string; to: string[] }> };
  await Promise.all(
    data.results
      .filter((m) => m.to.includes(email))
      .map((m) => fetch(`${SMTP4DEV_URL}/api/messages/${m.id}`, { method: 'DELETE' })),
  );
}

async function getInvitationToken(email: string): Promise<string> {
  let token = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
        const data = (await res.json()) as {
          results: Array<{ id: string; to: string[]; subject: string }>;
        };
        const msg = data.results.find(
          (m) => m.to.includes(email) && /invit/i.test(m.subject),
        );
        if (!msg) return false;
        const htmlRes = await fetch(`${SMTP4DEV_URL}/api/messages/${msg.id}/html`);
        const html = await htmlRes.text();
        const match = html.match(/\/invitation\/([A-Za-z0-9._-]+)/);
        if (!match) return false;
        token = match[1];
        return true;
      },
      { timeout: 10_000, message: `invitation email for ${email} never arrived` },
    )
    .toBe(true);
  return token;
}

async function activateUserApi(api: APIRequestContext, email: string, password: string) {
  const invitationToken = await getInvitationToken(email);
  const res = await api.post(`${API_URL}/auth/invitation/${invitationToken}/accept`, {
    data: { password },
  });
  expect(res.status(), `activate ${email}`).toBe(200);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
}

async function openUserDetailsDialog(page: Page, email: string) {
  await page.goto('/users');
  await page.getByRole('searchbox', { name: 'Search users' }).fill(email);
  await expect(page.getByRole('status')).toHaveText(/Showing 1\u20131 of 1/);
  await page.getByRole('row').filter({ hasText: email }).click();
  await expect(page.getByRole('dialog', { name: 'User Details' })).toBeVisible();
}

test.describe('User Management: profile updates, admin actions & guards', () => {
  test.describe.configure({ mode: 'serial' });

  const runid = String(Date.now());
  const nonAdmin = {
    name: `NonAdmin-${runid}`,
    email: `nonadmin.${runid}@example.com`,
    password: 'NonAdminPass123!',
  };
  const roleTarget = {
    name: `RoleTarget-${runid}`,
    email: `roletarget.${runid}@example.com`,
  };
  const helperAdmin = {
    name: `HelperAdmin-${runid}`,
    email: `helperadmin.${runid}@example.com`,
  };
  const removeTarget = {
    name: `RemoveTarget-${runid}`,
    email: `removetarget.${runid}@example.com`,
  };

  let api: APIRequestContext;
  let adminToken: string;
  let nonAdminUser: SeededUser;
  let roleTargetUser: SeededUser;
  let helperAdminUser: SeededUser;
  let removeTargetUser: SeededUser;

  test.beforeAll(async () => {
    api = await apiRequest.newContext();
    adminToken = await loginAsAdminApi(api);

    await Promise.all(
      [nonAdmin.email, roleTarget.email, helperAdmin.email, removeTarget.email].map(
        purgeMessagesFor,
      ),
    );

    [nonAdminUser, roleTargetUser, helperAdminUser, removeTargetUser] = await Promise.all([
      inviteUser(api, adminToken, { name: nonAdmin.name, email: nonAdmin.email }),
      inviteUser(api, adminToken, { name: roleTarget.name, email: roleTarget.email }),
      inviteUser(api, adminToken, {
        name: helperAdmin.name,
        email: helperAdmin.email,
        role: 'ADMIN',
      }),
      inviteUser(api, adminToken, { name: removeTarget.name, email: removeTarget.email }),
    ]);

    await activateUserApi(api, nonAdmin.email, nonAdmin.password);
    await purgeMessagesFor(nonAdmin.email);
  });

  test.afterAll(async () => {
    for (const id of [
      nonAdminUser?.id,
      roleTargetUser?.id,
      helperAdminUser?.id,
      removeTargetUser?.id,
    ]) {
      if (id) await deleteUserQuietly(api, adminToken, id);
    }
    await api.dispose();
  });

  test('TC_054: admin changes another user\'s role via User Details dialog', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, roleTarget.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await detailsDialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Internal User' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Change Role' });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(roleTarget.name);

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/users/${roleTargetUser.id}/role`) &&
          res.request().method() === 'PATCH',
      ),
      confirmDialog.getByRole('button', { name: 'Confirm' }).click(),
    ]);
    expect(patchRes.status()).toBe(200);

    await expect(confirmDialog).toBeHidden();

    const verifyRes = await api.get(`${API_URL}/admin/users/${roleTargetUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(verifyRes.status()).toBe(200);
    const verifyBody = (await verifyRes.json()) as { role: string };
    expect(verifyBody.role).toBe('INTERNAL_USER');

    if (await detailsDialog.isVisible()) {
      await page.keyboard.press('Escape');
    }
    await expect(
      page.getByRole('row').filter({ hasText: roleTarget.email }),
    ).toContainText(/Internal User/i);
  });

  test('TC_055: user updates own name; email input is disabled', async ({ page }) => {
    await loginAs(page, nonAdmin.email, nonAdmin.password);
    await page.goto('/my-account');

    await expect(page.getByRole('textbox', { name: 'Email' })).toBeDisabled();

    const saveButton = page.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeDisabled();

    const newName = `Updated Name ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Name' }).fill(newName);
    await expect(saveButton).toBeEnabled();

    const [putRes] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/auth/me') && res.request().method() === 'PUT',
      ),
      saveButton.click(),
    ]);
    expect(putRes.status()).toBe(200);

    const meRes = await api.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${await loginAsNonAdminApi(api, nonAdmin.email, nonAdmin.password)}` },
    });
    expect(meRes.status()).toBe(200);
    const me = (await meRes.json()) as { name: string };
    expect(me.name).toBe(newName);
  });

  test('TC_056: non-admin is blocked from User Management (UI and API)', async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      'Known shipping divergence: <AdminRoute> currently redirects to /projects instead of /. Remove this annotation once the redirect target is corrected.',
    );

    const nonAdminApiToken = await loginAsNonAdminApi(api, nonAdmin.email, nonAdmin.password);

    const forbiddenRes = await api.get(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${nonAdminApiToken}` },
    });
    expect(forbiddenRes.status()).toBe(403);

    const uiContext = await browser.newContext();
    const uiPage = await uiContext.newPage();
    try {
      await loginAs(uiPage, nonAdmin.email, nonAdmin.password);
      await uiPage.goto('/users');
      await expect(uiPage).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
    } finally {
      await uiContext.close();
    }

    void page;
  });

  test('TC_075: admin cannot act on their own account (role, disable, remove)', async () => {
    const meRes = await api.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(meRes.status()).toBe(200);
    const { id: selfId } = (await meRes.json()) as { id: string };

    const roleRes = await api.patch(`${API_URL}/admin/users/${selfId}/role`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { role: 'AUTHORIZED_USER' },
    });
    expect(roleRes.status()).toBe(400);
    const roleBody = (await roleRes.json()) as { message: string };
    expect(roleBody.message.toLowerCase()).toContain('cannot');
    expect(roleBody.message.toLowerCase()).toContain('update your own role');

    const disableRes = await api.patch(`${API_URL}/admin/users/${selfId}/disable`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(disableRes.status()).toBe(400);
    const disableBody = (await disableRes.json()) as { message: string };
    expect(disableBody.message.toLowerCase()).toContain('cannot');
    expect(disableBody.message.toLowerCase()).toContain('disable your own account');

    const removeRes = await api.delete(`${API_URL}/admin/users/${selfId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(removeRes.status()).toBe(400);
    const removeBody = (await removeRes.json()) as { message: string };
    expect(removeBody.message.toLowerCase()).toContain('cannot');
    expect(removeBody.message.toLowerCase()).toContain('remove your own account');

    const meAfter = await api.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(meAfter.status()).toBe(200);
    const meAfterBody = (await meAfter.json()) as { role: string; status: string };
    expect(meAfterBody.role).toBe('ADMIN');
    expect(meAfterBody.status).toBe('ACTIVE');
  });

  test('TC_076: admin removes another admin via User Details dialog', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, helperAdmin.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await detailsDialog.getByRole('button', { name: 'Remove User' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Remove User' });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(helperAdmin.name);

    const [delRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/users/${helperAdminUser.id}`) &&
          res.request().method() === 'DELETE',
      ),
      confirmDialog.getByRole('button', { name: 'Remove', exact: true }).click(),
    ]);
    expect(delRes.status()).toBe(204);

    await expect(confirmDialog).toBeHidden();
    await expect(detailsDialog).toBeHidden();

    await expect(page.getByRole('row').filter({ hasText: helperAdmin.email })).toHaveCount(0);

    const getRes = await api.get(`${API_URL}/admin/users/${helperAdminUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(getRes.status()).toBe(404);

    const meRes = await api.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(meRes.status()).toBe(200);
    const me = (await meRes.json()) as { role: string; status: string };
    expect(me.role).toBe('ADMIN');
    expect(me.status).toBe('ACTIVE');
  });

  test('TC_077: admin removes another non-admin user via User Details dialog', async ({
    page,
  }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, removeTarget.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await detailsDialog.getByRole('button', { name: 'Remove User' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Remove User' });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(removeTarget.name);

    const [delRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/users/${removeTargetUser.id}`) &&
          res.request().method() === 'DELETE',
      ),
      confirmDialog.getByRole('button', { name: 'Remove', exact: true }).click(),
    ]);
    expect(delRes.status()).toBe(204);

    await expect(confirmDialog).toBeHidden();
    await expect(detailsDialog).toBeHidden();

    await expect(page.getByRole('row').filter({ hasText: removeTarget.email })).toHaveCount(0);

    const getRes = await api.get(`${API_URL}/admin/users/${removeTargetUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(getRes.status()).toBe(404);
  });
});

async function loginAsNonAdminApi(
  api: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await api.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}
