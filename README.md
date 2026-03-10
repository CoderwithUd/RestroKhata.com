# Restro Khata Auth

Next.js (App Router) + TypeScript + Tailwind CSS auth frontend with RTK Toolkit.

## Features

- Login and Register pages only
- Cookie-based auth with `credentials: include`
- Session bootstrap on app load (`/auth/me`, fallback to refresh endpoint)
- Auto refresh + retry on 401 through RTK base query
- Guarded routing:
  - Authenticated user -> `/dashboard`
  - Unauthenticated user -> `/login`
- Light theme with only 4 colors
- Responsive for desktop, tablet, and small devices

## Backend Base URL

Configured default:

```env
NEXT_PUBLIC_API_BASE_URL=https://restro-backend-hpx8.onrender.com
```

## Endpoints Used

- `POST /api/auth/login`
- `POST /api/auth/register` (fallback: `/api/auth/register-owner`)
- `GET /api/auth/me`
- `POST /api/auth/refresh` (fallback: `/api/auth/refresh-token`)
- `POST /api/auth/logout`

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`
