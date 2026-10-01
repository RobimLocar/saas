import { NextRequest, NextResponse } from "next/server";
import { currencyForCountry } from "@/lib/stripe/client";

// Moeda que o checkout vai usar para este visitante (mesma regra do
// create-checkout), para a página de preços mostrar o valor que será cobrado.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const country = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
  return NextResponse.json(
    { currency: currencyForCountry(country) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
