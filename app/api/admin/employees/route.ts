import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { isAuthed } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();
  const employees = await sql`
    SELECT id, name, pin, active FROM employees WHERE active = TRUE ORDER BY name ASC
  `;
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "");

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO employees (name, pin) VALUES (${name}, ${pin})
    RETURNING id, name, pin, active
  `;
  return NextResponse.json({ employee: (rows as unknown[])[0] });
}
