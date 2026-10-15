"use client";

import { useEffect, useRef, useState } from "react";

type StreamState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "playable"; url: string }
  | { status: "unplayable"; url: string; protocol: string };

export function CctvPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<StreamState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/cctv/live-stream")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setState({ status: "error", message: data.error });
          return;
        }
        // Only HLS (.m3u8) is reliably playable directly in a browser
        // (natively on Safari, via hls.js elsewhere). Any other protocol
        // (rtmp, or an unconfirmed field name) gets an honest fallback
        // instead of a silently broken video element.
        const isHls = data.protocol?.includes("hls") || data.protocol?.includes("m3u8") || data.url?.endsWith(".m3u8");
        setState(isHls ? { status: "playable", url: data.url } : { status: "unplayable", url: data.url, protocol: data.protocol });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message ?? "Failed to reach the live stream endpoint" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "playable" || !videoRef.current) return;
    const video = videoRef.current;

    // Safari plays HLS natively — no library needed there.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = state.url;
      return;
    }

    // Everywhere else, use hls.js, loaded dynamically so it's not in the
    // main bundle for people who never open the CCTV page.
    let hls: any = null;
    import("hls.js").then((mod) => {
      const Hls = mod.default;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(state.url);
        hls.attachMedia(video);
      }
    });

    return () => {
      hls?.destroy();
    };
  }, [state]);

  if (state.status === "loading") {
    return <div className="flex aspect-video items-center justify-center rounded-xl bg-black/40 text-sm text-mist/40">Connecting to live feed…</div>;
  }

  if (state.status === "error") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl bg-black/40 p-6 text-center">
        <p className="text-sm text-clay-light">Could not reach the live feed.</p>
        <p className="text-xs text-mist/40">{state.message}</p>
      </div>
    );
  }

  if (state.status === "unplayable") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl bg-black/40 p-6 text-center">
        <p className="text-sm text-mist/60">
          This camera's stream format ({state.protocol}) isn't one browsers can play directly.
        </p>
        <p className="max-w-md break-all rounded bg-white/5 px-3 py-2 font-mono text-xs text-mist/50">{state.url}</p>
        <p className="text-xs text-mist/40">Open this URL in VLC or another RTMP-capable player to view it.</p>
      </div>
    );
  }

  return (
    <video ref={videoRef} controls autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black" />
  );
}