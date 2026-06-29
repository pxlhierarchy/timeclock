import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/admin";
import { pairPunches, type PunchRow } from "@/app/lib/sessions";

export const dynamic = "force-dynamic";

type Row = PunchRow & { name: string };

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  // Default to the last 14 days.
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 14, 1), 365);

  const rows = (await sql`
    SELECT p.id, p.employee_id, e.name, p.kind, p.ts, p.note, p.paid, p.paid_at
    FROM punches p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.ts >= now() - (${days} || ' days')::interval
    ORDER BY p.employee_id ASC, p.ts ASC
  `) as Row[];

  const nameById = new Map(rows.map((r) => [r.employee_id, r.name]));

  // inId/outId reference the underlying punch rows so the admin UI can edit or
  // remove a session.
  const sessions = pairPunches(rows)
    .map((s) => ({ ...s, name: nameById.get(s.employeeId) ?? "" }))
    .sort((a, b) => new Date(b.in).getTime() - new Date(a.in).getTime());

  // Totals per employee (completed sessions only), split into paid vs unpaid.
  const totals = new Map<
    number,
    { name: string; minutes: number; paidMinutes: number; unpaidMinutes: number; sessions: number }
  >();
  for (const s of sessions) {
    if (s.minutes == null) continue;
    const t =
      totals.get(s.employeeId) ||
      { name: s.name, minutes: 0, paidMinutes: 0, unpaidMinutes: 0, sessions: 0 };
    t.minutes += s.minutes;
    if (s.paid) t.paidMinutes += s.minutes;
    else t.unpaidMinutes += s.minutes;
    t.sessions += 1;
    totals.set(s.employeeId, t);
  }

  return NextResponse.json({
    days,
    sessions,
    totals: Array.from(totals.entries())
      .map(([employeeId, t]) => ({
        employeeId,
        name: t.name,
        minutes: t.minutes,
        paidMinutes: t.paidMinutes,
        unpaidMinutes: t.unpaidMinutes,
        sessions: t.sessions,
      }))
      // Most still-owed first, so payroll work rises to the top.
      .sort((a, b) => b.unpaidMinutes - a.unpaidMinutes || b.minutes - a.minutes),
  });
}
