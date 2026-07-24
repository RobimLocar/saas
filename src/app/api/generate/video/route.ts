import { NextResponse } from "next/server";

// TODO: implementar generate/video
export async function POST() {
  return NextResponse.json({ ok: true, route: "generate/video" });
}
