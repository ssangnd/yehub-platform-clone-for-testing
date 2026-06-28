import { test, expect } from '@playwright/test';
import { API_URL, SMTP4DEV_URL, TEST_USER } from '../constants';

async function purgeSmtp4dev() {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as { results: Array<{ id: string }> };
  await Promise.all(
    data.results.map((m) =>
      fetch(`${SMTP4DEV_URL}/api/messages/${m.id}`, { method: 'DELETE' }),
    ),
  );
}

async function messageCountFor(email: string): Promise<number> {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as { results: Array<{ to: string[] }> };
  return data.results.filter((m) => m.to.includes(email)).length;
}

test.describe('Forgot password: UI & validation', () => {
  test('TC_019: "Forgot password" link is visible on login and navigates to /forgot-password', async ({
    page,
  }) => {
    await page.goto('/login');

    const link = page.getByRole('link', { name: /forgot password/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/forgot-password/);

    await link.click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('TC_020: forgot-password page renders expected controls', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('button', { name: /send|reset/i })).toBeVisible();

    const backLink = page.getByRole('link', { name: /back to (login|sign in)/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/login');
  });

  test('TC_021: submitting a valid email shows confirmation copy', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().startsWith(`${API_URL}/auth/`) && r.request().method() === 'POST',
    );

    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
    await page.getByRole('button', { name: /send|reset/i }).click();

    const response = await responsePromise;
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);

    await expect(page.getByText(/check your email/i)).toBeVisible();
    await expect(page.getByText(/reset link has been sent/i)).toBeVisible();
  });

  test('TC_022: empty email submission shows required-field error', async ({ page }) => {
    await page.goto('/forgot-password');

    let hitForgotPasswordEndpoint = false;
    page.on('request', (req) => {
      if (req.url().includes('/auth/') && req.method() === 'POST') {
        hitForgotPasswordEndpoint = true;
      }
    });

    await page.getByRole('button', { name: /send|reset/i }).click();

    await expect(page.getByText(/email is required/i)).toBeVisible();
    expect(hitForgotPasswordEndpoint).toBe(false);
  });

  for (const invalidEmail of ['abc.com', 'no-at-sign', 'user@', '@host.com']) {
    test(`TC_023: rejects invalid email format "${invalidEmail}"`, async ({ page }) => {
      await page.goto('/forgot-password');

      let hitForgotPasswordEndpoint = false;
      page.on('request', (req) => {
        if (req.url().includes('/auth/') && req.method() === 'POST') {
          hitForgotPasswordEndpoint = true;
        }
      });

      await page.getByRole('textbox', { name: 'Email' }).fill(invalidEmail);
      await page.getByRole('button', { name: /send|reset/i }).click();

      await expect(page).toHaveURL(/\/forgot-password/);
      await expect(page.getByText(/invalid input|invalid email/i)).toBeVisible();
      expect(hitForgotPasswordEndpoint).toBe(false);
    });
  }

  test('TC_024: non-existent email shows generic success and sends no email (enumeration protection)', async ({
    page,
  }) => {
    await purgeSmtp4dev();
    const unknownEmail = `unknown.${Date.now()}@example.com`;

    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: 'Email' }).fill(unknownEmail);
    await page.getByRole('button', { name: /send|reset/i }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible();
    await expect(page.getByText(/reset link has been sent/i)).toBeVisible();

    await expect
      .poll(() => messageCountFor(unknownEmail), {
        timeout: 5_000,
        message: 'no email should be sent for an unknown recipient',
      })
      .toBe(0);
  });
});
