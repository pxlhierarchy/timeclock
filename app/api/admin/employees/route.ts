import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { requireAdmin, fail } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();
  const employees = await sql`
    SELECT id, name, pin, active FROM employees WHERE active = TRUE ORDER BY name ASC
  `;
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "");

  if (!name) return fail("Name is required.", 400);
  if (!/^\d{4}$/.test(pin)) return fail("PIN must be exactly 4 digits.", 400);

  const rows = await sql`
    INSERT INTO employees (name, pin) VALUES (${name}, ${pin})
    RETURNING id, name, pin, active
  `;
  return NextResponse.json({ employee: (rows as unknown[])[0] });
}
