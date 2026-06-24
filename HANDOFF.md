# Time Clock — Project Handoff

_Last updated: 2026-06-23_

An employee time-clock kiosk: staff tap their name and enter a 4-digit PIN to
punch in/out; an admin area manages employees and views timesheets. Built on
Next.js 16 (App Router) + React 19, backed by Neon Postgres, deployed on Vercel.

---

## 1. Current status

- **Code:** Complete and committed. Branch `master` is pushed to
  `github.com/pxlhierarchy/timeclock` (commit `86fe25d "Build employee
  time-clock kiosk"`). `git fetch` confirms the remote is in sync.
- **Deployment:** ⚠️ **Not live yet.** Vercel reports "no production
  deployments." This is a Vercel-side connection/config issue, **not** a missing
  push — see [§6 Going live](#6-going-live-fixing-no-production-deployments).
- **Uncommitted:** A minor `.gitignore` edit (working tree only, not yet committed).

---

## 2. Tech stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------ |
| Framework| Next.js `16.2.9` (App Router, Server Components + Route Handlers) |
| UI       | React `19.2.4`, plain CSS (`app/globals.css`), no UI library |
| Database | Neon Postgres via `@neondatabase/serverless` `^1.1.0`        |
| Auth     | HMAC-signed httpOnly cookie (admin only); employees use PINs |
| Hosting  | Vercel (Fluid Compute, Node runtime)                         |

No ORM — raw parameterized SQL via the Neon tagged-template client.

---

## 3. Architecture & file map

```
app/
  layout.tsx              Root layout + metadata
  page.tsx                KIOSK (client) — name grid + PIN pad + confirmation
  globals.css             All styling
  admin/
    page.tsx              Server gate: isAuthed() ? <Dashboard/> : <Login/>
    login.tsx             Client login form
    dashboard.tsx         Client admin UI — manage employees, view timesheet
  api/
    employees/route.ts            GET  public kiosk list (id, name, status — NO pins)
    punch/route.ts                POST punch in/out (toggles based on last punch)
    admin/login/route.ts          POST set admin session cookie
    admin/logout/route.ts         POST clear session
    admin/employees/route.ts      GET/POST list & add employees (auth required)
    admin/employees/[id]/route.ts DELETE soft-delete employee (auth required)
    admin/report/route.ts         GET timesheet sessions + totals (auth required)
  lib/
    db.ts                 Neon client, lazy connection, ensureSchema()
    auth.ts               Cookie session: checkPassword / create / destroy / isAuthed
```

All route handlers are `export const dynamic = "force-dynamic"` (no caching —
punches and reports must always be fresh).

---

## 4. How it works

### Data model (`app/lib/db.ts`)
Two tables, auto-created on first request by `ensureSchema()` (idempotent
`CREATE TABLE IF NOT EXISTS`, cached per warm instance, self-healing on new
deploys/regions):

- **`employees`** — `id, name, pin (text), active (bool), created_at`
- **`punches`** — `id, employee_id (FK, ON DELETE CASCADE), kind ('in'|'out'), ts`
  plus index `idx_punches_employee_ts (employee_id, ts)`.

The connection string is read lazily from the first of `DATABASE_URL`,
`POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING` — so the
build never needs the env var, only runtime requests do.

### Kiosk flow (`app/page.tsx`)
1. Fetches `/api/employees` (active employees + current in/out status). PINs are
   never sent to the client.
2. Tap a name → PIN pad modal. On the 4th digit it auto-submits to `/api/punch`.
3. `/api/punch` verifies the PIN, looks at the employee's **last** punch, and
   inserts the opposite `kind` (in→out, out→in). Returns name/action/timestamp.
4. A confirmation card shows for ~3.2s, then the list refreshes.
5. A live wall clock updates every second.

### Admin flow (`app/admin/*`)
- `/admin` is a server component that checks `isAuthed()` and renders either the
  login form or the dashboard.
- Dashboard lets you **add** employees (name + 4-digit PIN), **remove** them
  (soft-delete: `active = FALSE`, so historical timesheets survive), and view a
  **timesheet** for the last 1 / 7 / 14 / 30 days.
- `/api/admin/report` pairs consecutive in→out punches into sessions, computes
  per-session minutes and per-employee totals. Unmatched `in` punches show as
  "Still clocked in."

### Auth (`app/lib/auth.ts`)
- Admin password from `ADMIN_PASSWORD` env (**defaults to `"admin"`** if unset).
- Session cookie value = `HMAC-SHA256(password, "admin-session")`. Because the
  token is derived from the password, **changing `ADMIN_PASSWORD` instantly
  invalidates all existing sessions**.
- Cookie: httpOnly, sameSite=lax, secure in production, 12-hour expiry.
- Password and cookie comparisons use `timingSafeEqual`.

---

## 5. Environment variables

| Variable         | Required | Notes                                                      |
| ---------------- | -------- | ---------------------------------------------------------- |
| `DATABASE_URL`   | **Yes**  | Neon Postgres connection string. Auto-provisioned if you add the Neon integration on Vercel. Without it, all DB routes 500. |
| `ADMIN_PASSWORD` | **Yes*** | Admin login password. *Defaults to `"admin"` — **set a real one before going live.** |

Locally, put these in `.env.local` (git-ignored). `npm run dev` then works.

---

## 6. Going live (fixing "no production deployments")

The code is pushed; Vercel just hasn't built a production deployment. Work
through these in order:

1. **Connect the Git repo to the Vercel project.**
   Vercel dashboard → the `timeclock` project → **Settings → Git** → connect
   `pxlhierarchy/timeclock`. If no project exists yet, **Add New → Project →
   Import** that repo. (Vercel only auto-deploys *new* pushes after connecting,
   so do step 4 to trigger the first build.)

2. **Add the database.** Project → **Storage → Create / Connect → Neon
   Postgres**. This auto-injects `DATABASE_URL` into all environments. (Vercel
   Postgres/KV are retired — use the Neon Marketplace integration.)

3. **Set `ADMIN_PASSWORD`** under Settings → Environment Variables (Production)
   to something other than `admin`.

4. **Trigger the first production build** — either push a commit to `master`
   (e.g. commit the pending `.gitignore` change) or click **Deploy / Redeploy**
   in the dashboard. Confirm Settings → Git → **Production Branch = `master`**
   (Vercel may default it to `main`).

5. **Verify after deploy:** open the URL → kiosk loads (empty list is fine) →
   `/admin` → log in → add an employee → punch in/out on the kiosk → see the
   session in the timesheet. `ensureSchema()` creates the tables on the first
   request, so no manual migration is needed.

> CLI alternative (Vercel CLI is **not** installed here): `npm i -g vercel`,
> then `vercel link`, `vercel env pull`, and `vercel --prod`.

---

## 7. Known gaps / future work

- **PINs stored in plaintext** and shown in the admin table. Fine for a trusted
  back-office kiosk; hash them (e.g. bcrypt) if that's a concern.
- **No rate limiting** on PIN or admin-password attempts — brute-forceable.
- **Single admin password**, no per-user admin accounts or audit log.
- **No manual punch correction** — an admin can't edit/delete a bad punch or fix
  a forgotten clock-out; they only show as "Still clocked in."
- **Timezone:** sessions/totals are computed from UTC timestamps and formatted in
  the *viewer's* browser locale. Fine for one timezone; revisit for multi-region.
- **No CSV/export** of timesheets.
- **No tests.**
- **Default `ADMIN_PASSWORD = "admin"`** — must be overridden in production.

---

## 8. Local development

```bash
npm install
# create .env.local with DATABASE_URL=... and ADMIN_PASSWORD=...
npm run dev          # http://localhost:3000  (kiosk) and /admin
npm run build        # production build
npm run start        # serve the production build
```

> Note: this project's `AGENTS.md` warns that this Next.js build has breaking
> changes vs. older docs — consult `node_modules/next/dist/docs/` before
> changing framework-level code.
