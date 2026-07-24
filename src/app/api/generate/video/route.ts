import { NextResponse } from "next/server";

// TODO: implementar generate/video
export async function POST(request: Request) {
  return NextResponse.json({ ok: true, route: "generate/video" });
}
