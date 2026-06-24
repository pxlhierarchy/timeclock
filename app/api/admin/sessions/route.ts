import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/app/lib/db";
import { isAuthed } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

// Edit a session's clock-in (and clock-out) times. Identifies the underlying
// punch rows by inId/outId (from the report). If the session is still open
// (no outId) but an outTs is supplied, a clock-out punch is inserted to close
// it.
export async function PATCH(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const inId = Number(body.inId);
  const outId = body.outId == null ? null : Number(body.outId);
  const inTs = String(body.inTs ?? "");
  const outTs = body.outTs == null || body.outTs === "" ? null : String(body.outTs);

  if (!inId) {
    return NextResponse.json({ error: "Missing session reference." }, { status: 400 });
  }

  const inDate = new Date(inTs);
  if (Number.isNaN(inDate.getTime())) {
    return NextResponse.json({ error: "Invalid clock-in time." }, { status: 400 });
  }

  let outDate: Date | null = null;
  if (outTs != null) {
    outDate = new Date(outTs);
    if (Number.isNaN(outDate.getTime())) {
      return NextResponse.json({ error: "Invalid clock-out time." }, { status: 400 });
    }
    if (outDate.getTime() <= inDate.getTime()) {
      return NextResponse.json({ error: "Clock-out must be after clock-in." }, { status: 400 });
    }
    if (outDate.getTime() - inDate.getTime() > DAY_MS) {
      return NextResponse.json({ error: "A single session can't exceed 24 hours." }, { status: 400 });
    }
  }

  const inRow = (await sql`
    SELECT employee_id FROM punches WHERE id = ${inId} AND kind = 'in'
  `) as { employee_id: number }[];
  if (!inRow[0]) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  await sql`UPDATE punches SET ts = ${inDate.toISOString()} WHERE id = ${inId} AND kind = 'in'`;

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
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json().catch(() => ({}));
  const inId = Number(body.inId);
  const outId = body.outId == null ? null : Number(body.outId);

  if (!inId) {
    return NextResponse.json({ error: "Missing session reference." }, { status: 400 });
  }

  await sql`DELETE FROM punches WHERE id = ${inId}`;
  if (outId) {
    await sql`DELETE FROM punches WHERE id = ${outId}`;
  }

  return NextResponse.json({ ok: true });
}
