import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const employeeId = Number(body.employeeId);
    const pin = String(body.pin ?? "");

    if (!employeeId || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const rows = (await sql`
      SELECT id, name, pin FROM employees WHERE id = ${employeeId} AND active = TRUE
    `) as { id: number; name: string; pin: string }[];

    const employee = rows[0];
    if (!employee || employee.pin !== pin) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const last = (await sql`
      SELECT kind FROM punches WHERE employee_id = ${employeeId} ORDER BY ts DESC LIMIT 1
    `) as { kind: "in" | "out" }[];

    const nextKind: "in" | "out" = last[0]?.kind === "in" ? "out" : "in";

    const inserted = (await sql`
      INSERT INTO punches (employee_id, kind) VALUES (${employeeId}, ${nextKind})
      RETURNING ts
    `) as { ts: string }[];

    return NextResponse.json({
      name: employee.name,
      action: nextKind,
      ts: inserted[0].ts,
    });
  } catch (err) {
    console.error("punch error", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
