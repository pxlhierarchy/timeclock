import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { pairPunches, type PunchRow } from "@/app/lib/sessions";

export const dynamic = "force-dynamic";

// Timezone used to decide "today" / "this week" boundaries for the kiosk.
const KIOSK_TZ = process.env.KIOSK_TZ || "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

// How far (ms) `tz` is ahead of UTC at `date`.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") m[p.type] = Number(p.value);
  }
  const hour = m.hour === 24 ? 0 : m.hour;
  return Date.UTC(m.year, m.month - 1, m.day, hour, m.minute, m.second) - date.getTime();
}

// The calendar Y/M/D that `now` falls on, in tz.
function localYMD(now: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const m: Record<string, number> = {};
  for (const p of dtf.formatToParts(now)) {
    if (p.type !== "literal") m[p.type] = Number(p.value);
  }
  return { y: m.year, mo: m.month, d: m.day };
}

// UTC instant (ms) of local midnight for the given calendar date in tz.
function midnightMs(y: number, mo: number, d: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, 0, 0, 0);
  return guess - tzOffsetMs(new Date(guess), tz);
}

// Minutes of [in, out|now] that fall within [windowStart, now].
function overlapMinutes(inTs: string, outTs: string | null, windowStart: number, now: number): number {
  const start = Math.max(new Date(inTs).getTime(), windowStart);
  const end = Math.min(outTs ? new Date(outTs).getTime() : now, now);
  return end > start ? Math.round((end - start) / 60000) : 0;
}

export async function POST(request: Request) {
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const employeeId = Number(body.employeeId);
  const pin = String(body.pin ?? "");
  if (!employeeId || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const emp = (await sql`
    SELECT id, name, pin FROM employees WHERE id = ${employeeId} AND active = TRUE
  `) as { id: number; name: string; pin: string }[];
  if (!emp[0] || emp[0].pin !== pin) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  // Look back far enough to cover the current week with margin.
  const rows = (await sql`
    SELECT id, employee_id, kind, ts FROM punches
    WHERE employee_id = ${employeeId} AND ts >= now() - interval '60 days'
    ORDER BY ts ASC
  `) as PunchRow[];

  const sessions = pairPunches(rows);

  const now = Date.now();
  const today = localYMD(new Date(now), KIOSK_TZ);
  const dayStart = midnightMs(today.y, today.mo, today.d, KIOSK_TZ);
  // Start of the week = most recent Monday 00:00 in the kiosk timezone.
  const dow = new Date(Date.UTC(today.y, today.mo - 1, today.d)).getUTCDay(); // 0=Sun..6=Sat
  const monday = new Date(
    Date.UTC(today.y, today.mo - 1, today.d) - ((dow + 6) % 7) * DAY_MS
  );
  const weekStart = midnightMs(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    KIOSK_TZ
  );

  let todayMinutes = 0;
  let weekMinutes = 0;
  let openSince: string | null = null;
  for (const s of sessions) {
    if (s.out == null) openSince = s.in;
    todayMinutes += overlapMinutes(s.in, s.out, dayStart, now);
    weekMinutes += overlapMinutes(s.in, s.out, weekStart, now);
  }

  return NextResponse.json({
    name: emp[0].name,
    status: openSince ? "in" : "out",
    openSince,
    todayMinutes,
    weekMinutes,
    timezone: KIOSK_TZ,
  });
}
