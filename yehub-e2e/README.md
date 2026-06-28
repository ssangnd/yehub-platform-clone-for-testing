# yehub-e2e

End-to-end tests for the YeHub platform using [Playwright](https://playwright.dev).

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Playwright browsers: `npx playwright install chromium`

## Quick Start

```bash
# Install dependencies
npm install

# Start the full stack (postgres, redis, minio, backend, frontend, etc.)
npm run docker:up

# Run all tests
npm test

# Stop containers
npm run docker:down
```

Running `npm test` will automatically start Docker containers via the `webServer` config in `playwright.config.ts` and tear them down after tests complete.

## Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run all tests headless |
| `npm run test:headed` | Run tests in a visible browser (single worker) |
| `npm run test:ui` | Open Playwright UI mode for debugging |
| `npm run report` | Open the last HTML test report |
| `npm run docker:up` | Build and start all Docker services |
| `npm run docker:down` | Stop and remove containers |
| `npm run docker:clean` | Stop containers and remove volumes |

## Project Structure

```
yehub-e2e/
  docker-compose.yml      # Dedicated e2e Docker stack
  playwright.config.ts    # Playwright config (webServer, globalTeardown)
  global-teardown.ts      # Runs docker compose down after tests
  tests/
    constants.ts          # Shared test constants (credentials, URLs)
    login.spec.ts         # Login flow tests (6 tests)
    invite-user.spec.ts   # Invite user flow tests (6 tests, serial)
```

## Docker Services

The e2e compose spins up an isolated stack with `yehub-e2e-*` container names:

| Service | Purpose |
|---------|---------|
| postgres | Database |
| redis | Cache |
| minio | S3-compatible object storage |
| smtp4dev | Email capture (web UI at port 5555) |
| backend-migrate | Runs Prisma migrations then exits |
| backend-seed | Seeds test data then exits |
| backend | NestJS API on port 3000 |
| frontend | React app served by nginx on port 5173 |

Startup order: postgres healthy -> migrate completes -> seed + backend start -> frontend starts.

## Writing Tests

### Test file naming

- Place test files in `tests/` with the `.spec.ts` extension
- Name files after the feature: `login.spec.ts`, `invite-user.spec.ts`

### Constants

Use `tests/constants.ts` for shared values:

```typescript
import { TEST_USER, API_URL, SMTP4DEV_URL } from './constants';
```

### Parallel vs serial tests

- **Parallel** (default): Use for independent tests that don't share state. The login tests are a good example.
- **Serial** (`test.describe.configure({ mode: 'serial' })`): Use when tests depend on each other. The invite-user flow is serial because each step builds on the previous one.

### Mocking API responses

For tests that don't need to hit the real backend (e.g., testing error UI), mock the API with `page.route()`:

```typescript
await page.route(`${API_URL}/auth/login`, (route) =>
  route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Invalid credentials', statusCode: 401 }),
  }),
);
```

This avoids rate limiting and makes tests faster and deterministic.

### Checking emails via smtp4dev

The smtp4dev web API is exposed at port 5555. Use `fetch` in tests to query it:

```typescript
// List all messages
const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
const { results } = await res.json();

// Get HTML content of a specific message
const html = await fetch(`${SMTP4DEV_URL}/api/messages/${id}/html`).then(r => r.text());
```

### Rate limiting

The backend login endpoint has a rate limit of 5 requests per 60 seconds. To avoid hitting it:

- Mock API responses for negative test cases (wrong password, non-existent user)
- Only hit the real backend for the successful login test
- If tests must be serial due to shared state, combine tests that login as the same user

## Writing Tests with AI using Playwright CLI

The project includes a [playwright-cli skill](../.claude/skills/playwright-cli/) for Claude Code that enables AI-assisted test development. This workflow lets you interactively explore the app, then convert your findings into automated tests.

### Workflow

1. **Start the Docker stack**

   ```bash
   npm run docker:up
   ```

2. **Explore the app interactively with playwright-cli**

   Use playwright-cli commands to navigate, interact, and take snapshots:

   ```bash
   # Open a browser
   playwright-cli open http://localhost:5173/login

   # Take a snapshot to see the page structure with element refs
   playwright-cli snapshot

   # Interact using refs from the snapshot
   playwright-cli fill e16 "admin@sociallistening.com"
   playwright-cli fill e21 "password123"
   playwright-cli click e22

   # Take another snapshot to see the result
   playwright-cli snapshot

   # Close when done
   playwright-cli close
   ```

3. **Identify test cases from your exploration**

   As you navigate, note:
   - What elements are visible and their accessible roles/names
   - What happens on form submission (success, validation errors, API errors)
   - What the URL changes to after actions
   - What text/elements appear in the result

4. **Ask Claude Code to implement the tests**

   After exploring, ask Claude to write the test file based on your findings. Claude will use the snapshot data to write proper Playwright locators using `getByRole`, `getByText`, etc.

### Playwright CLI Cheat Sheet

```bash
# Navigation
playwright-cli open <url>
playwright-cli goto <url>
playwright-cli go-back
playwright-cli reload

# Interaction
playwright-cli click <ref>
playwright-cli fill <ref> "text"
playwright-cli select <ref> "value"
playwright-cli press Enter
playwright-cli type "text"

# Inspection
playwright-cli snapshot                    # Full page snapshot
playwright-cli snapshot --depth=4          # Limit depth
playwright-cli screenshot                  # Save screenshot
playwright-cli console                     # View console logs
playwright-cli network                     # View network requests
playwright-cli eval "document.title"       # Run JS in page

# Storage & State
playwright-cli cookie-list
playwright-cli localstorage-list

# Session management
playwright-cli close
```

### Tips

- **Always snapshot after actions** to see the updated page state before writing assertions
- **Use accessible locators** from snapshots: `getByRole('button', { name: 'Sign in' })` is more resilient than CSS selectors
- **Check for dynamic content**: if a page loads data async, the first snapshot might not have everything. Snapshot again after a moment.
- **Use the smtp4dev API** for email-dependent flows instead of trying to open emails in a browser
