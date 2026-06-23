import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "tc_admin";

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "admin";
}

// Token tied to the current password — changing ADMIN_PASSWORD invalidates
// all existing sessions automatically.
function sessionToken(): string {
  return createHmac("sha256", adminPassword()).update("admin-session").digest("hex");
}

export function checkPassword(input: string): boolean {
  const a = Buffer.from(input || "");
  const b = Buffer.from(adminPassword());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function createSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  const expected = sessionToken();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
