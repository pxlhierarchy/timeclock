import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { requireAdmin, fail } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

// Soft-delete: deactivate so historical punches/timesheets are preserved.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const { id } = await params;
  const employeeId = Number(id);
  if (!employeeId) return fail("Invalid id.", 400);

  await sql`UPDATE employees SET active = FALSE WHERE id = ${employeeId}`;
  return NextResponse.json({ ok: true });
}
