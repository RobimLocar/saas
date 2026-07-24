import { NextResponse } from "next/server";

// TODO: implementar credits
export async function GET() {
  return NextResponse.json({ ok: true, route: "credits" });
}
