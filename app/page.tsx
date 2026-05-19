"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Film,
  Link2,
  Loader2,
  MonitorPlay,
  Play,
  ShieldCheck,
  Waves,
} from "lucide-react";

type Resolution = "audio" | "720p" | "1080p" | "best";

type MediaInfo = {
  title: string;
  duration: number | null;
  thumbnail: string | null;
  webpage_url: string;
};

const RESOLUTION_OPTIONS: Array<{ key: Resolution; label: string; subtitle: string }> = [
  { key: "audio", label: "Audio-only", subtitle: "Bandwidth-light optimized stream" },
  { key: "720p", label: "720p", subtitle: "Balanced quality and speed" },
  { key: "1080p", label: "1080p", subtitle: "High-definition streaming" },
  { key: "best", label: "Best", subtitle: "Maximum available quality" },
];

function formatDuration(duration: number | null): string {
  if (!duration || Number.isNaN(duration)) return "Unknown";
  const totalSeconds = Math.max(0, Math.floor(duration));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [resolution, setResolution] = useState<Resolution>("best");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);

  const canSubmit = useMemo(() => url.trim().length > 8 && !isFetching, [url, isFetching]);

  async function handleParseMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsFetching(true);

    try {
      const response = await fetch(`/api/fetch-info?url=${encodeURIComponent(url.trim())}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as MediaInfo & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to parse media info");
      }

      setInfo(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected parsing error");
    } finally {
      setIsFetching(false);
    }
  }

  const streamHref = info
    ? `/api/stream?url=${encodeURIComponent(info.webpage_url)}&resolution=${resolution}`
    : "#";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_15%,#1e293b_0%,#0b1120_50%,#020617_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(56,189,248,0.08),rgba(14,116,144,0.05),transparent)]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-cyan-400/20 bg-slate-900/70 p-7 shadow-[0_25px_80px_rgba(14,116,144,0.25)] backdrop-blur-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Secure Authorized Ingestion
          </div>

          <h1 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-4xl">
            Generic Media Ingestion & Streaming Dashboard
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Parse authorized media links with hardened server-side validation and stream content directly from
            yt-dlp pipelines without local file persistence.
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-xl backdrop-blur-lg sm:p-6">
          <form className="space-y-4" onSubmit={handleParseMedia}>
            <label htmlFor="authorized-media-url" className="block text-sm font-medium text-slate-300">
              Authorized Media URL
            </label>

            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/80" />
                <input
                  id="authorized-media-url"
                  name="authorized-media-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.currentTarget.value)}
                  required
                  placeholder="https://example.org/open-media"
                  className="h-12 w-full rounded-xl border border-cyan-500/30 bg-slate-950/70 pl-10 pr-4 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <button
                id="parse-media-button"
                type="submit"
                disabled={!canSubmit}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 text-sm font-semibold text-slate-950 transition hover:from-cyan-300 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                Parse Media
              </button>
            </div>
          </form>
        </section>

        {isFetching && (
          <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <div className="h-56 animate-pulse rounded-2xl bg-slate-800/70" />
            <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <div className="h-6 w-3/4 animate-pulse rounded bg-slate-800/80" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-800/80" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="h-20 animate-pulse rounded-xl bg-slate-800/80" />
                ))}
              </div>
            </div>
          </section>
        )}

        {error && (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </section>
        )}

        {info && !isFetching && (
          <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <article className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-lg">
              {info.thumbnail ? (
                <img
                  id="media-thumbnail"
                  src={info.thumbnail}
                  alt={info.title}
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-56 items-center justify-center bg-slate-800 text-slate-400">No thumbnail</div>
              )}

              <div className="space-y-2 p-4">
                <h2 className="line-clamp-2 text-base font-semibold text-white">{info.title}</h2>
                <p className="text-xs text-slate-400">Duration: {formatDuration(info.duration)}</p>
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-lg">
              <h2 className="text-lg font-semibold text-white">Stream Resolution</h2>
              <p className="mt-1 text-sm text-slate-400">Choose a pipeline profile before starting playback.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {RESOLUTION_OPTIONS.map((option) => {
                  const active = resolution === option.key;
                  return (
                    <button
                      id={`resolution-option-${option.key}`}
                      key={option.key}
                      type="button"
                      onClick={() => setResolution(option.key)}
                      className={`rounded-xl border p-4 text-left transition ${
                        active
                          ? "border-cyan-400/70 bg-cyan-500/15"
                          : "border-white/10 bg-slate-800/50 hover:border-cyan-400/40"
                      }`}
                    >
                      <div className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
                        {option.key === "audio" ? <Waves className="h-4 w-4" /> : <MonitorPlay className="h-4 w-4" />}
                        {option.label}
                      </div>
                      <p className="text-xs text-slate-400">{option.subtitle}</p>
                    </button>
                  );
                })}
              </div>

              <a
                id="start-stream-link"
                href={streamHref}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-teal-400 px-5 text-sm font-semibold text-slate-950 transition hover:from-emerald-200 hover:to-teal-300"
              >
                <Play className="h-4 w-4" />
                Start Stream
              </a>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
