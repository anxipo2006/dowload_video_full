import dns from "node:dns/promises";
import net from "node:net";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

export type StreamResolution = "audio" | "720p" | "1080p" | "best";

export type MediaInfo = {
  title: string;
  duration: number | null;
  thumbnail: string | null;
  webpage_url: string;
};

type SpawnOptions = {
  timeoutMs?: number;
};

const YTDLP_BIN = process.env.YTDLP_BIN?.trim() || "yt-dlp";
const DEFAULT_INFO_TIMEOUT_MS = 45_000;
const DEFAULT_STREAM_TIMEOUT_MS = 30 * 60_000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

async function assertNoSsrfTarget(hostname: string): Promise<void> {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) {
    throw new Error("Target host is not allowed");
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    throw new Error("Private IPv4 addresses are blocked");
  }
  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    throw new Error("Private IPv6 addresses are blocked");
  }

  if (ipVersion !== 0) {
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error("Failed to resolve target hostname");
  }

  for (const record of records) {
    if (record.family === 4 && isPrivateIPv4(record.address)) {
      throw new Error("Resolved private IPv4 target blocked");
    }
    if (record.family === 6 && isPrivateIPv6(record.address)) {
      throw new Error("Resolved private IPv6 target blocked");
    }
  }
}

function sanitizeRawUrl(rawUrl: string): URL {
  if (typeof rawUrl !== "string") {
    throw new Error("Invalid URL input");
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new Error("Invalid URL length");
  }

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new Error("URL contains invalid control characters");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Malformed URL");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Only HTTP(S) URLs are supported");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Credentialed URLs are not allowed");
  }

  return parsed;
}

export async function sanitizeAndAuthorizeUrl(rawUrl: string): Promise<string> {
  const parsed = sanitizeRawUrl(rawUrl);
  await assertNoSsrfTarget(parsed.hostname);
  parsed.hash = "";
  return parsed.toString();
}

function formatSelectorForResolution(resolution: StreamResolution): string {
  // Bỏ qua việc đòi hỏi ghép hình + tiếng phức tạp, 
  // ép lấy file gộp sẵn (b = best) của giao diện Mobile để không bị lỗi format
  switch (resolution) {
    case "audio":
      return "bestaudio/best";
    case "720p":
    case "1080p":
    case "best":
    default:
      return "b";
  }
}

function attachTimeout(child: ChildProcessWithoutNullStreams, timeoutMs: number): NodeJS.Timeout {
  return setTimeout(() => {
    child.kill("SIGKILL");
  }, timeoutMs);
}

// Hàm cấu hình lõi (THÊM MỚI Ở BẢN NÂNG CẤP)
function getBaseArgs(): string[] {
  return [
    "--no-warnings",
    "--no-playlist",
    // Dùng lại mặt nạ Android để lách Bot 100% không cần Cookie
    "--extractor-args", "youtube:player_client=android",
    "--geo-bypass",
  ];
}

export async function fetchMediaInfo(rawUrl: string, options: SpawnOptions = {}): Promise<MediaInfo> {
  const safeUrl = await sanitizeAndAuthorizeUrl(rawUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_INFO_TIMEOUT_MS;

  // Sử dụng cấu hình lõi nâng cấp
  const args = [...getBaseArgs(), "-J", safeUrl];

  const child = spawn(YTDLP_BIN, args, {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    if (stdout.length > 1_000_000) {
      child.kill("SIGKILL");
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 32_000) {
      stderr = stderr.slice(-32_000);
    }
  });

  // @ts-ignore
  const timeout = attachTimeout(child as any, timeoutMs);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => clearTimeout(timeout));

  if (exitCode !== 0) {
    throw new Error(`yt-dlp metadata lookup failed (${exitCode}): ${stderr || "unknown error"}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error("yt-dlp returned malformed metadata JSON");
  }

  return {
    title: typeof data.title === "string" ? data.title : "Unknown title",
    duration: typeof data.duration === "number" ? data.duration : null,
    thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : null,
    webpage_url: typeof data.webpage_url === "string" ? data.webpage_url : safeUrl,
  };
}

export async function spawnStreamProcess(rawUrl: string, resolution: StreamResolution, options: SpawnOptions = {}) {
  const safeUrl = await sanitizeAndAuthorizeUrl(rawUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;

  // Sử dụng cấu hình lõi nâng cấp
  const args = [
    ...getBaseArgs(),
    "-f",
    formatSelectorForResolution(resolution),
    "-o",
    "-",
    safeUrl,
  ];

  const child = spawn(YTDLP_BIN, args, {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 32_000) {
      stderr = stderr.slice(-32_000);
    }
  });

  // @ts-ignore
  const timeout = attachTimeout(child as any, timeoutMs);

  return {
    child,
    timeout,
    safeUrl,
    getStderr: () => stderr,
  };
}