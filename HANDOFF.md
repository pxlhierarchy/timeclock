# Time Clock — Project Handoff

_Last updated: 2026-06-29_

An employee time-clock kiosk: staff tap their name and enter a 4-digit PIN to
punch in/out; an admin area manages employees, corrects time, and views
timesheets. Built on Next.js 16 (App Router) + React 19, backed by Neon
Postgres, deployed on Vercel.

---

## 1. Current status

- **Code:** Complete and committed on branch `master`, pushed to
  `github.com/pxlhierarchy/timeclock`.
- **Deployment:** ✅ **Live in production on Vercel.**
  - Custom domain: **https://time.skeetscloset.fit**
  - Vercel alias: https://timeclock-pied.vercel.app
  - The Vercel project (`timeclock`, org `pxlhierarchys-projects`) is **linked**
    locally via the Vercel CLI; `vercel --prod` redeploys.
- **Database:** Neon Postgres, connected. The **same** Neon database backs both
  local dev and production (one connection string in both places).

> ⚠️ **`ADMIN_PASSWORD` is still `admin` in production.** Change it before this
> is trusted with real payroll data — see [§5](#5-environment-variables).

---

## 2. Tech stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------ |
| Framework| Next.js `16.2.9` (App Router, Server Components + Route Handlers) |
| UI       | React `19.2.4`, plain CSS (`app/globals.css`), no UI library |
| Database | Neon Postgres via `@neondatabase/serverless` `^1.1.0`        |
| Auth     | HMAC-signed httpOnly cookie (admin only); employees use PINs |
| Hosting  | Vercel (Fluid Compute, Node runtime)                         |
| Tooling  | Vercel CLI (installed + linked), TypeScript (`tsc --noEmit`) |

No ORM — raw parameterized SQL via the Neon tagged-template client.

The look is a **dark terminal / phosphor-green monospace theme**; all visual
styling lives in `app/globals.css` via CSS custom properties (`--bg`, `--green`,
`--panel`, `--mono`, …). Restyle by editing those tokens, not the components.

---

## 3. Architecture & file map

```
app/
  layout.tsx              Root layout + metadata
  page.tsx                KIOSK (client) — name grid + PIN pad + confirmation
  globals.css             ALL styling (terminal theme, CSS variables)
  admin/
    page.tsx              Server gate: isAuthed() ? <Dashboard/> : <Login/>
    login.tsx             Client login form
    dashboard.tsx         Client admin UI — employees, manual hours, edit/remove
                          sessions, timezone setting, timesheet + totals
  api/
    employees/route.ts            GET  public kiosk list (id, name, status — NO pins)
    punch/route.ts                POST punch in/out (toggles based on last punch)
    my-hours/route.ts             POST PIN-gated: an employee's today/this-week totals
    admin/login/route.ts          POST set admin session cookie
    admin/logout/route.ts         POST clear session
    admin/employees/route.ts      GET/POST list & add employees
    admin/employees/[id]/route.ts DELETE soft-delete employee
    admin/punches/route.ts        POST add a manual session (forgot-to-punch)
    admin/sessions/route.ts       PATCH edit / DELETE remove an existing session
    admin/paid/route.ts           POST mark sessions paid/unpaid (by clock-in id)
    admin/report/route.ts         GET timesheet sessions + per-employee totals
  lib/
    db.ts                 Neon client, lazy connection, ensureSchema()
    auth.ts               Cookie session primitives (checkPassword/create/destroy/isAuthed)
    admin.ts              Shared admin-route helpers (requireAdmin/fail/parseInOut)
    sessions.ts           pairPunches() — shared in->out pairing (report + my-hours)
```

All route handlers are `export const dynamic = "force-dynamic"` (no caching —
punches and reports must always be fresh).

### Shared admin-route conventions (`app/lib/admin.ts`)
Every authenticated admin route follows the same shape — **reuse these, don't
re-inline them** (this is what the last cleanup consolidated):

```ts
const denied = await requireAdmin();   // 401 NextResponse, or null if authed
if (denied) return denied;
await ensureSchema();
// ...
if (bad) return fail("message", 400);  // JSON { error } shorthand
```

- `requireAdmin()` — auth gate, returns a 401 response or `null`.
- `fail(message, status)` — `NextResponse.json({ error }, { status })`.
- `parseInOut(inTs, outTs)` — validates a clock-in/out pair (valid dates,
  out-after-in, ≤24h) and returns `{ inDate, outDate }` or `{ error }`. Shared by
  the manual-entry (`punches`) and session-edit (`sessions`) routes — change a
  time rule **here** and both stay consistent.

---

## 4. How it works

### Data model (`app/lib/db.ts`)
Two tables, auto-created on first request by `ensureSchema()` (idempotent
`CREATE TABLE IF NOT EXISTS`, cached per warm instance, self-healing on new
deploys/regions):

- **`employees`** — `id, name, pin (text), active (bool), created_at`
- **`punches`** — `id, employee_id (FK, ON DELETE CASCADE), kind ('in'|'out'), ts,
  note (text, nullable), paid (bool, default false), paid_at (timestamptz,
  nullable)` plus index `idx_punches_employee_ts (employee_id, ts)`.
  Per-session **note** and **paid** state are stored on the session's `in` punch
  (all added via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in
  `ensureSchema()`); the pairing carries them onto the derived session.

There is **no sessions table** — a "session" is a derived concept: the report
pairs each `in` punch with the next `out` punch per employee. Manual entries and
edits are just inserts/updates/deletes on `punches`, so they flow through the
same pairing automatically.

The connection string is read lazily from the first of `DATABASE_URL`,
`POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING` — so the
build never needs the env var, only runtime requests do.

### Kiosk flow (`app/page.tsx`)
1. Fetches `/api/employees` (active employees + current in/out status). PINs are
   never sent to the client.
2. Tap a name → PIN pad modal. Enter the 4-digit PIN, then choose an action:
   - **Clock in / out** → `/api/punch` verifies the PIN, looks at the employee's
     **last** punch, and inserts the opposite `kind` (in→out, out→in). Returns
     name/action/timestamp; a confirmation card shows for ~3.2s.
   - **My hours** → `/api/my-hours` verifies the PIN and returns the employee's
     running totals for **today** and **this week** (including time on a shift
     that's still open), shown in the modal. Day/week boundaries use `KIOSK_TZ`.
3. The list refreshes after a punch. A live wall clock updates every second.

> Note: entering the PIN no longer auto-punches — the employee taps **Clock
> in/out** or **My hours**. This is intentional (enables the hours view and
> prevents accidental punches).

### Admin flow (`app/admin/*`)
`/admin` is a server component that checks `isAuthed()` and renders the login
form or the dashboard. The dashboard (one client component) provides:

- **Add / remove employees.** Remove is a soft-delete (`active = FALSE`) so
  historical timesheets survive.
- **Timezone setting.** A dropdown of IANA zones (full list via
  `Intl.supportedValuesOf`, else a curated fallback). Persisted in
  **`localStorage`** (`timeclock.tz`), defaults to the browser's zone. This is a
  **per-browser** display/entry preference, not a server-side company setting.
- **Add manual hours.** Pick an employee + clock-in/out date-times (and an
  optional **note**) → inserts an in/out punch pair (`POST /api/admin/punches`).
  For forgotten punches.
- **Timesheet** for the last 1 / 7 / 14 / 30 days, with:
  - **Total hours by employee** (session count + **unpaid / paid / total** hours,
    sorted by most unpaid first), with a **Mark N paid** button per employee that
    marks all their unpaid completed sessions in the period paid at once.
  - **Sessions** list. Each row shows its **note** and a **Paid** toggle (a green
    "✓ Paid" badge you can click to undo, or a "Mark paid" button), plus inline
    **Edit** (timezone-aware date-time pickers + a note field; can also close a
    still-open session) and **Remove** (`PATCH` / `DELETE /api/admin/sessions`).
    Editing sends `note` in the PATCH — omitting it leaves the note unchanged, an
    empty string clears it. Paid state is toggled separately via
    `POST /api/admin/paid` (`{ inIds: number[], paid: boolean }` — one id for a row,
    many for the bulk button; stamps/clears `paid_at`). Unmatched `in` punches show
    as "Still clocked in" and can't be marked paid (no duration yet).

### Timezone handling (important when touching admin time UI)
Timestamps are stored in Postgres as UTC (`TIMESTAMPTZ`) and sent to the client
as ISO strings. The **client** does all zone conversion against the selected
`tz`, using three helpers in `dashboard.tsx`:

- `fmtDateTime(iso, tz)` — display an instant in the chosen zone.
- `isoToZonedInput(iso, tz)` — UTC ISO → `"YYYY-MM-DDTHH:mm"` for a
  `datetime-local` input (pre-fill when editing).
- `zonedWallTimeToISO(localStr, tz)` — the input's wall-clock string → UTC ISO
  to send to the API.

So: read with `isoToZonedInput`, write with `zonedWallTimeToISO`. The server
trusts the ISO instants it receives and only validates ordering/range.

### Auth (`app/lib/auth.ts`)
- Admin password from `ADMIN_PASSWORD` env (**defaults to `"admin"`** if unset).
- Session cookie value = `HMAC-SHA256(password, "admin-session")`. Because the
  token is derived from the password, **changing `ADMIN_PASSWORD` instantly
  invalidates all existing sessions.**
- Cookie `tc_admin`: httpOnly, sameSite=lax, secure in production, 12-hour expiry.
- Password and cookie comparisons use `timingSafeEqual`.

---

## 5. Environment variables

| Variable         | Required | Notes                                                      |
| ---------------- | -------- | ---------------------------------------------------------- |
| `DATABASE_URL`   | **Yes**  | Neon Postgres connection string. Set in `.env.local` (local) and in Vercel Production. Without it, all DB routes 500. |
| `ADMIN_PASSWORD` | **Yes*** | Admin login password. *Currently `"admin"` in prod — **change it.** |
| `KIOSK_TZ`       | No       | IANA timezone for the kiosk "today / this week" boundaries in `/api/my-hours`. Defaults to `America/New_York`. |

`DATABASE_URL` and `ADMIN_PASSWORD` are set in Vercel Production and in local
`.env.local` (git-ignored). `KIOSK_TZ` is optional (set it in Vercel if the
business isn't US-Eastern).

**Change the production admin password:**
```bash
printf 'NEW_STRONG_PASSWORD' | vercel env rm ADMIN_PASSWORD production -y
printf 'NEW_STRONG_PASSWORD' | vercel env add ADMIN_PASSWORD production
vercel --prod            # redeploy so the new value takes effect
```
(Also update `.env.local` for local dev. Changing it logs out all admin sessions.)

---

## 6. Local development

```bash
npm install
# .env.local already exists with DATABASE_URL and ADMIN_PASSWORD
npm run dev          # http://localhost:3000  (kiosk) and /admin
npm run build        # production build
npm run start        # serve the production build
npx tsc --noEmit     # typecheck (run this before every commit)
```

> ⚠️ Local dev and production share the **same Neon database** — test data you
> create locally shows up live, and vice-versa. Clean up after experiments.

---

## 7. Deploying

The repo is linked to Vercel and the CLI is installed:

```bash
vercel --prod        # build + deploy to production (and the custom domain)
vercel env ls        # inspect production env vars
vercel logs <url>    # runtime logs
```

`ensureSchema()` creates tables on the first request, so no migration step is
needed. There is **no GitHub auto-deploy** wired up yet — deploys are manual via
the CLI. (To enable push-to-deploy: Vercel dashboard → project → Settings → Git →
connect `pxlhierarchy/timeclock`, Production Branch = `master`.)

---

## 8. Adding features without breaking things

- **New admin API route?** Start with the `requireAdmin()` / `fail()` pattern
  from §3 and put any time validation in `parseInOut` (extend it rather than
  re-checking inline).
- **Touching the timesheet/time UI?** Respect the client-side timezone helpers
  (§4) — never format a stored UTC instant without the selected `tz`.
- **Schema change?** Add an idempotent `CREATE TABLE/ALTER ... IF NOT EXISTS` (or
  an additive migration) inside `ensureSchema()`; it runs on first request per
  warm instance. Avoid destructive changes to `punches`/`employees` — the report
  pairing and soft-delete depend on their current shape.
- **Styling?** Edit CSS variables in `globals.css`; components reference classes
  (`.panel`, `.btn`, `.btn.ghost`, `.btn.danger`, `.pill`, `.field`, `.row`,
  `.mono-num`), so token changes restyle everything at once.
- **Always run `npx tsc --noEmit`** before committing; the API routes are
  curl-testable with a logged-in cookie jar (see git history / examples).
- **AGENTS.md** warns this Next.js build has breaking changes vs. older docs —
  consult `node_modules/next/dist/docs/` before changing framework-level code
  (route signatures, caching, `cookies()`, etc.).

---

## 9. Known gaps / future work

- **PINs stored in plaintext** and shown in the admin table. Fine for a trusted
  back-office kiosk; hash them (e.g. bcrypt) if that's a concern.
- **No rate limiting** on PIN or admin-password attempts — brute-forceable.
- **Single admin password**, no per-user admin accounts or audit log.
- **Timezone is per-browser** (`localStorage`), not a shared company setting. If
  multiple admins need one fixed zone, store it server-side (e.g. a `settings`
  table) instead.
- **Manual entries can't span >24h** and the editor works one session at a time —
  no bulk edit.
- **No CSV / export** of timesheets.
- **No automated tests** (only `tsc` + manual curl/UI checks).
- **No GitHub auto-deploy** — deploys are manual `vercel --prod`.
- **Default `ADMIN_PASSWORD = "admin"`** still live in production — change it.
