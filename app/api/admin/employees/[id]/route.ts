import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { isAuthed } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

// Soft-delete: deactivate so historical punches/timesheets are preserved.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  const { id } = await params;
  const employeeId = Number(id);
  if (!employeeId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  await sql`UPDATE employees SET active = FALSE WHERE id = ${employeeId}`;
  return NextResponse.json({ ok: true });
}
