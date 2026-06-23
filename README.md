# ⏱ Time Clock

A simple employee time-tracking kiosk. Employees punch in / punch out by tapping
their name and entering a 4-digit PIN. An admin dashboard manages employees and
shows timesheets.

Built with Next.js (App Router) + Neon Postgres, deployed on Vercel.

## Pages

- `/` — the kiosk. Shows every active employee, a live clock, and a PIN pad.
  Tapping a name toggles between clocked-in and clocked-out.
- `/admin` — password-protected dashboard to add/remove employees and view
  hours worked. Default password is `admin` — **change it in production** via
  the `ADMIN_PASSWORD` environment variable.

## Environment variables

| Variable         | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection string (auto-set by the Neon integration). |
| `ADMIN_PASSWORD` | Password for the `/admin` dashboard.                           |

The database schema (employees + punches tables) is created automatically on
first request — no migration step needed.

## Local development

1. Copy `.env.example` to `.env.local` and fill in a Neon `DATABASE_URL`.
2. `npm install`
3. `npm run dev` and open http://localhost:3000

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo at vercel.com.
3. Add the **Neon** integration from the Vercel Marketplace (sets `DATABASE_URL`).
4. Add an `ADMIN_PASSWORD` environment variable.
5. Deploy.
