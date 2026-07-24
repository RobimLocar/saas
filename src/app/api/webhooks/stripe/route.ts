import { NextResponse } from "next/server";

// TODO: implementar webhooks/stripe
export async function POST() {
  return NextResponse.json({ ok: true, route: "webhooks/stripe" });
}
