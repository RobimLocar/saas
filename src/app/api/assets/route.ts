import { NextResponse } from "next/server";

// TODO: implementar assets
export async function GET() {
  return NextResponse.json({ ok: true, route: "assets" });
}
