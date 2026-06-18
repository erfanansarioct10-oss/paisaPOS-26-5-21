import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return NextResponse.json(
    {
      status: configured ? "ok" : "degraded",
      service: "chlorif",
      timestamp: new Date().toISOString(),
      checks: {
        supabaseEnv: configured,
      },
    },
    {
      status: configured ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function HEAD() {
  return new Response(null, {
    status: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
