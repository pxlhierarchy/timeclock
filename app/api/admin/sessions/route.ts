import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { requireAdmin, fail, parseInOut } from "@/app/lib/admin";

export const dynamic = "force-dynamic";

// Edit a session's clock-in (and clock-out) times. Identifies the underlying
// punch rows by inId/outId (from the report). If the session is still open
// (no outId) but an outTs is supplied, a clock-out punch is inserted to close it.
export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const inId = Number(body.inId);
  const outId = body.outId == null ? null : Number(body.outId);
  const inTs = String(body.inTs ?? "");
  const outTs = body.outTs == null || body.outTs === "" ? null : String(body.outTs);
  // A note is optional; an empty string clears it. `undefined` leaves it unchanged.
  const note =
    body.note === undefined
      ? undefined
      : body.note == null || String(body.note).trim() === ""
        ? null
        : String(body.note).trim();

  if (!inId) return fail("Missing session reference.", 400);

  const inDate = new Date(inTs);
  if (Number.isNaN(inDate.getTime())) return fail("Invalid clock-in time.", 400);

  // When a clock-out is supplied, validate the full pair with the shared rules.
  let outDate: Date | null = null;
  if (outTs != null) {
    const parsed = parseInOut(inTs, outTs);
    if ("error" in parsed) return fail(parsed.error, 400);
    outDate = parsed.outDate;
  }

  const inRow = (await sql`
    SELECT employee_id FROM punches WHERE id = ${inId} AND kind = 'in'
  `) as { employee_id: number }[];
  if (!inRow[0]) return fail("Session not found.", 404);

  await sql`UPDATE punches SET ts = ${inDate.toISOString()} WHERE id = ${inId} AND kind = 'in'`;

  if (note !== undefined) {
    await sql`UPDATE punches SET note = ${note} WHERE id = ${inId} AND kind = 'in'`;
  }

  if (outDate) {
    if (outId) {
      await sql`UPDATE punches SET ts = ${outDate.toISOString()} WHERE id = ${outId} AND kind = 'out'`;
    } else {
      // Closing a previously-open session.
      await sql`
        INSERT INTO punches (employee_id, kind, ts)
        VALUES (${inRow[0].employee_id}, 'out', ${outDate.toISOString()})
      `;
    }
  }

  const minutes = outDate
    ? Math.round((outDate.getTime() - inDate.getTime()) / 60000)
    : null;
  return NextResponse.json({ ok: true, minutes });
}

// Remove a session: delete its clock-in punch and, if present, its clock-out.
export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const inId = Number(body.inId);
  const outId = body.outId == null ? null : Number(body.outId);
  if (!inId) return fail("Missing session reference.", 400);

  await sql`DELETE FROM punches WHERE id = ${inId}`;
  if (outId) await sql`DELETE FROM punches WHERE id = ${outId}`;

  return NextResponse.json({ ok: true });
}
