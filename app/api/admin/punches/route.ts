import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { isAuthed } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

// Add a manual time entry (a complete clock-in -> clock-out session) for an
// employee who forgot to punch. Inserts an 'in' punch and an 'out' punch at the
// supplied timestamps, which the report then pairs into a session like any other.
export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const employeeId = Number(body.employeeId);
  const inTs = String(body.inTs ?? "");
  const outTs = String(body.outTs ?? "");

  if (!employeeId) {
    return NextResponse.json({ error: "Choose an employee." }, { status: 400 });
  }

  const inDate = new Date(inTs);
  const outDate = new Date(outTs);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    return NextResponse.json({ error: "Enter both a clock-in and clock-out time." }, { status: 400 });
  }
  if (outDate.getTime() <= inDate.getTime()) {
    return NextResponse.json({ error: "Clock-out must be after clock-in." }, { status: 400 });
  }
  // Guard against fat-fingered dates producing absurd sessions (> 24h).
  if (outDate.getTime() - inDate.getTime() > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "A single session can't exceed 24 hours." }, { status: 400 });
  }

  const emp = (await sql`
    SELECT id, name FROM employees WHERE id = ${employeeId} AND active = TRUE
  `) as { id: number; name: string }[];
  if (!emp[0]) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  await sql`
    INSERT INTO punches (employee_id, kind, ts)
    VALUES (${employeeId}, 'in', ${inDate.toISOString()}),
           (${employeeId}, 'out', ${outDate.toISOString()})
  `;

  const minutes = Math.round((outDate.getTime() - inDate.getTime()) / 60000);
  return NextResponse.json({
    employee: emp[0],
    in: inDate.toISOString(),
    out: outDate.toISOString(),
    minutes,
  });
}
