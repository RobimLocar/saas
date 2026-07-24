import { NextResponse } from "next/server";

// TODO: implementar webhooks/piapi
export async function POST() {
  return NextResponse.json({ ok: true, route: "webhooks/piapi" });
}
