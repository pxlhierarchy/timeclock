import { NextResponse } from "next/server";
import { isAuthed } from "@/app/lib/auth";

export const DAY_MS = 24 * 60 * 60 * 1000;

// Returns a 401 response when the caller isn't an authenticated admin, or null
// when they are. Usage: `const denied = await requireAdmin(); if (denied) return denied;`
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAuthed()) return null;
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

// JSON error shorthand.
export function fail(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Validate a clock-in/clock-out pair, returning the parsed dates or an error
// message. Shared by the manual-entry and session-edit routes.
export function parseInOut(
  inTs: string,
  outTs: string
): { inDate: Date; outDate: Date } | { error: string } {
  const inDate = new Date(inTs);
  const outDate = new Date(outTs);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    return { error: "Enter valid clock-in and clock-out times." };
  }
  if (outDate.getTime() <= inDate.getTime()) {
    return { error: "Clock-out must be after clock-in." };
  }
  if (outDate.getTime() - inDate.getTime() > DAY_MS) {
    return { error: "A single session can't exceed 24 hours." };
  }
  return { inDate, outDate };
}
