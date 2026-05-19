import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchMediaInfo, spawnStreamProcess, StreamResolution } from "@/lib/yt-dlp-streamer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_RESOLUTIONS = new Set<StreamResolution>(["audio", "720p", "1080p", "best"]);

function resolveResolution(input: string | null): StreamResolution {
  const value = (input || "best").toLowerCase() as StreamResolution;
  return ALLOWED_RESOLUTIONS.has(value) ? value : "best";
}

function mediaContentType(resolution: StreamResolution): string {
  if (resolution === "audio") return "audio/webm";
  return "video/mp4";
}

export async function GET(request: NextRequest) {
  try {
    const sourceUrl = request.nextUrl.searchParams.get("url");
    const resolution = resolveResolution(request.nextUrl.searchParams.get("resolution"));

    if (!sourceUrl) {
      return NextResponse.json({ error: "Missing url query parameter" }, { status: 400 });
    }

    // 1. Quét thông tin video trước
    const info = await fetchMediaInfo(sourceUrl, { timeoutMs: 45_000 });

    // 2. Khởi tạo tiến trình stream
    const { child, timeout, safeUrl, getStderr } = await spawnStreamProcess(sourceUrl, resolution);

    request.signal.addEventListener("abort", () => {
      child.kill("SIGKILL");
    });

    let completed = false;
    let failed = false;

    // 3. Khởi tạo luồng ReadableStream
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        child.stdout.once("end", () => {
          completed = true;
          controller.close();
        });

        child.once("error", (err) => {
          failed = true;
          controller.error(err);
        });

        child.once("close", (code) => {
          clearTimeout(timeout);
          if (code !== 0 && !completed) {
            failed = true;
            controller.error(new Error(`yt-dlp stream failed (${code}): ${getStderr() || "unknown error"}`));
          }
        });
      },
      cancel() {
        child.kill("SIGKILL");
      },
    });

    // 4. LƯU DATABASE NGAY LẬP TỨC TRƯỚC KHI STREAM TRẢ VỀ TRÌNH DUYỆT
    try {
      await prisma.streamHistory.create({
        data: {
          source_url: safeUrl,
          media_title: info.title || "Unknown Title",
          resolution: resolution,
        },
      });
      console.log("✅ Đã lưu lịch sử tải vào Database Railway thành công!");
    } catch (dbError) {
      console.error("❌ Lỗi lưu Database:", dbError);
    }

    // 5. Trả stream về trình duyệt (Ép tải xuống)
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": mediaContentType(resolution),
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Disposition": `attachment; filename="downloaded_video.${resolution === "audio" ? "webm" : "mp4"}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to stream media";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}