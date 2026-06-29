import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { requireAdmin, fail } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

// Mark one or more sessions paid (or unpaid). A session is identified by its
// clock-in punch id, so both the per-row toggle (one id) and the per-employee
// bulk action (many ids) post the same shape: { inIds: number[], paid: boolean }.
// `paid_at` is stamped now() when marking paid and cleared when unmarking.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const paid = body.paid === true;
  const inIds = Array.isArray(body.inIds)
    ? body.inIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];

  if (inIds.length === 0) return fail("No sessions selected.", 400);

  if (paid) {
    await sql`
      UPDATE punches SET paid = TRUE, paid_at = now()
      WHERE id = ANY(${inIds}) AND kind = 'in'
    `;
  } else {
    await sql`
      UPDATE punches SET paid = FALSE, paid_at = NULL
      WHERE id = ANY(${inIds}) AND kind = 'in'
    `;
  }

  return NextResponse.json({ ok: true, updated: inIds.length, paid });
}
