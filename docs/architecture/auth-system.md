# Auth System

## Overview

The VareyaShip UI is protected by a **JWT-based session** stored in an HttpOnly cookie. Authentication is single-user (admin dashboard) — the webhook and cron endpoints use separate auth mechanisms (carrier integrations verify via ShipHero; cron routes use a shared `CRON_SECRET` header).

---

## Auth Flow

```
Browser                              Server
  │                                     │
  │  GET /signin                        │
  │  ← HTML form (server component)     │
  │     action={login}                  │
  │                                     │
  │  POST /signin (form submit)         │
  │  ──────────────────────────────────→│
  │   next-action: <action-id>          │  Server Action runs
  │   email + password                  │  on the server
  │                                     │
  │                                     │  Compare against
  │                                     │  ADMIN_EMAIL /
  │                                     │  ADMIN_PASSWORD env vars
  │                                     │
  │  ← 303 redirect /                   │  jwt.sign({ userId }, ...)
  │    Set-Cookie: token=<jwt>          │  cookies().set() + redirect()
  │      HttpOnly; Secure;              │  (single server roundtrip)
  │      SameSite=Lax; Max-Age=604800   │
  │                                     │
  │  GET / (follows redirect)           │
  │  ──────────────────────────────────→│
  │  Cookie: token=<jwt>                │
  │                                     │
  │  ← Middleware: jwt.verify(token)    │
  │  ← 200 HTML (app renders)           │
  │                                     │
  │  On failure:                        │
  │  ← 303 redirect /signin?error=invalid│
```

---

## Components

### 1. Session Module — `src/modules/auth/session.ts`

The core auth primitive. Used by both the middleware and API routes.

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createToken` | `(userId: string) => string` | Signs a JWT with 7-day expiry using `JWT_SECRET` |
| `verifyToken` | `(token: string) => { userId: string } \| null` | Verifies signature + expiry. Returns `null` on any failure (expired, bad signature, malformed) |
| `requireAuth` | `(req: NextRequest) => Response \| null` | Extracts token from cookie, calls `verifyToken`. Returns `401` JSON response if invalid, `null` if valid |

### 2. Login Server Action — `src/app/signin/page.tsx` :: `login()`

The login handler is a **Server Action** defined in the signin page file. It handles form submission in a single request-response cycle — no separate API route needed.

- Reads `email` and `password` from `FormData` (native form submission)
- Compares against `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars
- On success: calls `cookies().set()` to set the HttpOnly JWT cookie, then `redirect('/')`
- On failure: `redirect('/signin?error=invalid')`
- If env vars missing: `redirect('/signin?error=config')`
- The form uses `action={login}` instead of a string URL

**Cookie attributes:**

| Attribute | Value |
|-----------|-------|
| `httpOnly` | `true` |
| `secure` | `true` in production, `false` in dev |
| `sameSite` | `lax` |
| `maxAge` | `604800` seconds (7 days) |
| `path` | `/` |

**Cookie attributes:**

| Attribute | Value |
|-----------|-------|
| `httpOnly` | `true` |
| `secure` | `true` in production, `false` in dev |
| `sameSite` | `lax` |
| `maxAge` | `604800` seconds (7 days) |
| `path` | `/` |

### 3. Logout Route — `src/app/api/(auth)/logout/route.ts`

- `DELETE /api/logout`
- Deletes the `token` cookie

### 4. Middleware — `src/middleware.ts`

- Runs only on the `/` route (the app page)
- Reads `token` cookie and calls `jwt.verify()`
- If missing or invalid: `redirect /signin`
- If valid: `NextResponse.next()`
- The sign-in page (`/signin`) and all API routes are excluded from the middleware matcher — API routes self-protect via `requireAuth()`

### 5. Protected API Routes

These routes call `requireAuth(req)` at the top of their handler:

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/batches` | GET | List batches for ops console |
| `POST /api/batches/[batchId]/force-close` | POST | Force-close a batch |
| `GET /api/manifests` | GET | List manifests |
| `GET /api/manifests/[manifestId]` | GET | Manifest detail |
| `GET /api/shipments` | GET | Search shipments |
| `GET /api/feature-flags` | GET | Read feature flags |

### 6. Sign-In Page — `src/app/signin/page.tsx`

- **Server component** — no `"use client"`, no JavaScript required for auth
- Defines a **Server Action** `login(formData)` at the top of the file:
  - Uses `'use server'` directive
  - Validates credentials against env vars
  - Sets the HttpOnly cookie via `cookies().set()`
  - Redirects via `redirect('/')` on success, `redirect('/signin?error=invalid')` on failure
- The `<form>` uses `action={login}` (function reference, not string URL)
- Error states driven by `searchParams.error`:
  - `?error=invalid` → `"invalid email or password"`
  - `?error=config` → `"server configuration error"`
- The entire flow is a single HTTP request handled entirely on the server — no client-side JavaScript involved

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret key for signing JWT tokens. Must be a strong, unique value. |
| `ADMIN_EMAIL` | Yes | Admin email for sign-in |
| `ADMIN_PASSWORD` | Yes | Admin password for sign-in (plaintext; compared against env var) |

These must be configured in both `.env` (local dev) and Vercel Environment Variables (production).

---

## Excluded Endpoints (No Cookie Auth)

These endpoints do **not** use cookie-based auth. They use their own mechanisms:

| Endpoint | Auth Mechanism |
|----------|---------------|
| `POST /api/[...shipment_method]` | ShipHero webhook (trusted caller) |
| `POST /api/asendia` | Carrier API (internal) |
| `POST /api/asendiasync` | Carrier API (internal) |
| `POST /api/postnl/label` | Carrier API (internal) |
| `POST /api/royalmail/label` | Carrier API (internal) |
| `GET /api/cron/*` | `Authorization: Bearer ${CRON_SECRET}` |
| `GET /api/uploadthing/file/*` | Public file proxy |

---

## Security Properties

| Property | Status |
|----------|--------|
| Token signature verified | ✅ `jwt.verify()` in middleware and `requireAuth()` |
| Token expiry enforced | ✅ JWT `exp` claim set to 7 days, verified on every request |
| HttpOnly cookie | ✅ Token not readable by JavaScript (XSS protection) |
| Secure flag | ✅ Enabled in production |
| SameSite=Lax | ✅ CSRF protection |
| Credentials in env vars | ✅ Not hardcoded in source |
| No multi-user support | ⚠️ Single admin user only (intentional for dashboard scope) |

---

## Related

- Sign-in page: `src/app/signin/page.tsx`
- Avatar/Logout UI: `src/app/screens/avatar.tsx`
- JWT library: `jsonwebtoken` (v9)
