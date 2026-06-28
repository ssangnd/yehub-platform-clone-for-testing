# yehub-fe

React frontend for the YeHub platform.

## Tech Stack

- **Framework:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** shadcn/ui + @base-ui/react
- **Routing:** React Router Dom v7
- **Data Fetching:** TanStack React Query v5
- **API Client:** Axios with JWT access/refresh token interceptors
- **Forms:** React Hook Form v7 + Zod v4
- **Global State:** Zustand v5
- **Charts:** Recharts
- **Toasts:** Sonner

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- [yehub-be](../yehub-be/README.md) running locally

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:3000/v1
```

### 3. Start the dev server

```bash
pnpm dev
```

The app is available at `http://localhost:5173`.

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm dev`          | Start development server (Vite HMR)  |
| `pnpm build`        | Type-check and build for production  |
| `pnpm preview`      | Preview the production build locally |
| `pnpm lint`         | ESLint                               |
| `pnpm format`       | Prettier formatting                  |
| `pnpm format:check` | Check formatting without writing     |
