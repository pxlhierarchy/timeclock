import { NextResponse } from "next/server";
import { checkPassword, createSession } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "");

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
