import { NextResponse } from "next/server";

// TODO: implementar generate/audio
export async function POST() {
  return NextResponse.json({ ok: true, route: "generate/audio" });
}
