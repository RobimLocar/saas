import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ credits: 0, plan: "free" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance, plan")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      credits: profile?.credits_balance ?? 0,
      plan: profile?.plan ?? "free",
    });
  } catch {
    return NextResponse.json({ credits: 0, plan: "free" }, { status: 500 });
  }
}
