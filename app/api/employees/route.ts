import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Public: kiosk list. Returns id, name, and current clocked-in status only.
// PINs are never exposed here.
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT
        e.id,
        e.name,
        COALESCE(
          (SELECT p.kind FROM punches p WHERE p.employee_id = e.id ORDER BY p.ts DESC LIMIT 1),
          'out'
        ) AS status,
        (SELECT p.ts FROM punches p WHERE p.employee_id = e.id ORDER BY p.ts DESC LIMIT 1) AS since
      FROM employees e
      WHERE e.active = TRUE
      ORDER BY e.name ASC
    `) as { id: number; name: string; status: "in" | "out"; since: string | null }[];

    return NextResponse.json({ employees: rows });
  } catch (err) {
    console.error("employees error", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
