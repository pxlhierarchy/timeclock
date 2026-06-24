import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { isAuthed } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  employee_id: number;
  name: string;
  kind: "in" | "out";
  ts: string;
};

export async function GET(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  // Default to the last 14 days.
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 14, 1), 365);

  const rows = (await sql`
    SELECT p.id, p.employee_id, e.name, p.kind, p.ts
    FROM punches p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.ts >= now() - (${days} || ' days')::interval
    ORDER BY p.employee_id ASC, p.ts ASC
  `) as Row[];

  // Pair in -> out into sessions per employee. inId/outId reference the
  // underlying punch rows so the admin UI can edit or remove a session.
  type Session = {
    employeeId: number;
    name: string;
    inId: number;
    outId: number | null;
    in: string;
    out: string | null;
    minutes: number | null;
  };
  const sessions: Session[] = [];
  const openByEmployee = new Map<number, Row>();

  for (const r of rows) {
    if (r.kind === "in") {
      // If there was an unmatched 'in', close it out as incomplete.
      openByEmployee.set(r.employee_id, r);
    } else {
      const open = openByEmployee.get(r.employee_id);
      if (open) {
        const minutes = Math.round(
          (new Date(r.ts).getTime() - new Date(open.ts).getTime()) / 60000
        );
        sessions.push({
          employeeId: r.employee_id,
          name: r.name,
          inId: open.id,
          outId: r.id,
          in: open.ts,
          out: r.ts,
          minutes,
        });
        openByEmployee.delete(r.employee_id);
      }
    }
  }
  // Any still-open punches = currently clocked in.
  for (const open of openByEmployee.values()) {
    sessions.push({
      employeeId: open.employee_id,
      name: open.name,
      inId: open.id,
      outId: null,
      in: open.ts,
      out: null,
      minutes: null,
    });
  }

  sessions.sort((a, b) => new Date(b.in).getTime() - new Date(a.in).getTime());

  // Totals per employee (completed sessions only).
  const totals = new Map<number, { name: string; minutes: number; sessions: number }>();
  for (const s of sessions) {
    if (s.minutes == null) continue;
    const t = totals.get(s.employeeId) || { name: s.name, minutes: 0, sessions: 0 };
    t.minutes += s.minutes;
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
        sessions: t.sessions,
      }))
      .sort((a, b) => b.minutes - a.minutes),
  });
}
