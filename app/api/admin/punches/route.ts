import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { requireAdmin, fail, parseInOut } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

// Add a manual time entry (a complete clock-in -> clock-out session) for an
// employee who forgot to punch. Inserts an 'in' punch and an 'out' punch at the
// supplied timestamps, which the report then pairs into a session like any other.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const employeeId = Number(body.employeeId);
  if (!employeeId) return fail("Choose an employee.", 400);

  const parsed = parseInOut(String(body.inTs ?? ""), String(body.outTs ?? ""));
  if ("error" in parsed) return fail(parsed.error, 400);
  const { inDate, outDate } = parsed;

  const emp = (await sql`
    SELECT id, name FROM employees WHERE id = ${employeeId} AND active = TRUE
  `) as { id: number; name: string }[];
  if (!emp[0]) return fail("Employee not found.", 404);

  await sql`
    INSERT INTO punches (employee_id, kind, ts)
    VALUES (${employeeId}, 'in', ${inDate.toISOString()}),
           (${employeeId}, 'out', ${outDate.toISOString()})
  `;

  return NextResponse.json({
    employee: emp[0],
    in: inDate.toISOString(),
    out: outDate.toISOString(),
    minutes: Math.round((outDate.getTime() - inDate.getTime()) / 60000),
  });
}
