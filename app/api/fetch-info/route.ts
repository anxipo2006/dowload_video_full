import { NextRequest, NextResponse } from "next/server";
import { fetchMediaInfo } from "@/lib/yt-dlp-streamer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sourceUrl = request.nextUrl.searchParams.get("url");

    if (!sourceUrl) {
      return NextResponse.json({ error: "Missing url query parameter" }, { status: 400 });
    }

    const info = await fetchMediaInfo(sourceUrl, { timeoutMs: 45_000 });

    return NextResponse.json(info, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to fetch media info";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
