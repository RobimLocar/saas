import { NextResponse } from "next/server";

// TODO: implementar generate/image
export async function POST() {
  return NextResponse.json({ ok: true, route: "generate/image" });
}
