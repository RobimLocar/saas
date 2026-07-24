import { NextResponse } from "next/server";

// TODO: implementar webhooks/piapi
export async function POST(request: Request) {
  return NextResponse.json({ ok: true, route: "webhooks/piapi" });
}
