"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { createClient } from "@/lib/supabase/client";

/**
 * 1:1 rebuild of the real login page, sourced directly from the old dev
 * PC's actual project files — NOT guessed:
 *   resources/views/auth/login.blade.php
 *   resources/views/layouts/loginlayouts.blade.php
 *   public/css/style.css (the 4 diagonal corner colors + reveal animation)
 *   public/css/cssbuttoncustom.css (the .bn5 rainbow-glow submit button)
 *
 * The real page covers the whole screen with 4 giant colored diagonal
 * triangles (opacity 0.65) and reveals the centered login form (fading in,
 * while the triangles slide outward) on :hover of the container. Real
 * hex colors, confirmed from the actual CSS file:
 *   top-left     #b5422b (rust red)
 *   top-right    #76e69f (mint green)
 *   bottom-left  #eea663 (warm orange)
 *   bottom-right #c0c0c0 (silver gray)
 *
 * Hover-only reveal doesn't work on touch devices, so this also reveals on
 * tap/click and on focus-within (keyboard nav landing on an input) as a
 * pragmatic accessibility addition — the real site's actual behavior is
 * preserved for mouse users, nothing about it is changed.
 *
 * reCAPTCHA (2026-09-22): the real site uses actual Google reCAPTCHA v2
 * (the "I'm not a robot" checkbox that can escalate to an image challenge)
 * — previously this was just a plain checkbox standing in for it, which
 * isn't real verification at all (anyone could tick it with devtools).
 * This now renders the real widget via Google's own script and verifies
 * the resulting token server-side (/api/verify-recaptcha) before ever
 * calling Supabase sign-in — a client-only check can't be trusted, since
 * the token itself has to be validated against Google's servers using our
 * secret key, which must never reach the browser.
 *
 * Needs two env vars in .env.local (from https://www.google.com/recaptcha/admin):
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=...   (public, safe to ship to the browser)
 *   RECAPTCHA_SECRET_KEY=...              (private, used only by the API route)
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        container: HTMLElement,
        params: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const renderCaptcha = useCallback(() => {
    if (!window.grecaptcha || !captchaContainerRef.current || !siteKey) return;
    if (widgetIdRef.current !== null) return; // already rendered

    // window.grecaptcha exists the instant api.js's <script> tag finishes
    // loading, but .render isn't attached to it until reCAPTCHA finishes
    // its OWN internal init a beat later — calling .render() straight away
    // throws "window.grecaptcha.render is not a function". grecaptcha.ready()
    // is Google's own documented way to wait for that: it fires immediately
    // if already ready, or once init finishes if not.
    window.grecaptcha.ready(() => {
      if (!window.grecaptcha || !captchaContainerRef.current) return;
      if (widgetIdRef.current !== null) return; // guard again — ready() can fire late
      widgetIdRef.current = window.grecaptcha.render(captchaContainerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
      });
    });
  }, [siteKey]);

  // In case the grecaptcha script finishes loading before this effect runs
  // (fast cache hit), try rendering on mount too, not just from onLoad.
  useEffect(() => {
    renderCaptcha();
  }, [renderCaptcha]);

  function resetCaptcha() {
    if (window.grecaptcha && widgetIdRef.current !== null) {
      window.grecaptcha.reset(widgetIdRef.current);
    }
    setCaptchaToken(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!siteKey) {
      setError("reCAPTCHA is not configured yet (NEXT_PUBLIC_RECAPTCHA_SITE_KEY missing).");
      return;
    }
    if (!captchaToken) {
      setError("Please complete the reCAPTCHA check.");
      return;
    }

    setLoading(true);

    // Verify the token server-side FIRST — never trust the client alone.
    const verifyRes = await fetch("/api/verify-recaptcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: captchaToken }),
    });
    const verifyJson = (await verifyRes.json()) as { success: boolean; error?: string };

    if (!verifyJson.success) {
      setLoading(false);
      setError(verifyJson.error ?? "reCAPTCHA verification failed. Please try again.");
      resetCaptcha();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      resetCaptcha();
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div
      className="group relative min-h-screen w-full overflow-hidden bg-white"
      onClick={() => setRevealed(true)}
      onFocus={() => setRevealed(true)}
    >
      {/* Google's reCAPTCHA v2 script — explicit render mode so we control
          exactly when/where the widget mounts, instead of the implicit
          auto-render mode (which needs a data-sitekey div at parse time). */}
      <Script
        src="https://www.google.com/recaptcha/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderCaptcha}
      />

      {/* The 4 giant diagonal corner triangles — real colors, real
          rotation angles, real transition timing from style.css */}
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] origin-[0%_50%] rotate-45 bg-[#b5422b] opacity-[0.65] transition-all delay-200 duration-500 ease-[cubic-bezier(0.445,0.05,0,1)] ${
          revealed ? "!ml-[200px] !origin-[-200px_50%] !delay-0" : ""
        } group-hover:!ml-[200px] group-hover:!origin-[-200px_50%] group-hover:!delay-0`}
        style={{ marginTop: "-100vmax" }}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] origin-[0%_50%] rotate-[135deg] bg-[#76e69f] opacity-[0.65] transition-all delay-200 duration-500 ease-[cubic-bezier(0.445,0.05,0,1)] ${
          revealed ? "!ml-[200px] !origin-[-200px_50%] !delay-0" : ""
        } group-hover:!ml-[200px] group-hover:!origin-[-200px_50%] group-hover:!delay-0`}
        style={{ marginTop: "-100vmax" }}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] origin-[0%_50%] -rotate-45 bg-[#eea663] opacity-[0.65] transition-all delay-200 duration-500 ease-[cubic-bezier(0.445,0.05,0,1)] ${
          revealed ? "!ml-[200px] !origin-[-200px_50%] !delay-0" : ""
        } group-hover:!ml-[200px] group-hover:!origin-[-200px_50%] group-hover:!delay-0`}
        style={{ marginTop: "-100vmax" }}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] origin-[0%_50%] -rotate-[135deg] bg-[#c0c0c0] opacity-[0.65] transition-all delay-200 duration-500 ease-[cubic-bezier(0.445,0.05,0,1)] ${
          revealed ? "!ml-[200px] !origin-[-200px_50%] !delay-0" : ""
        } group-hover:!ml-[200px] group-hover:!origin-[-200px_50%] group-hover:!delay-0`}
        style={{ marginTop: "-100vmax" }}
        aria-hidden
      />

      {/* The centered login form — hidden (opacity 0) until revealed,
          exact 400x400 box size and centering from the real CSS */}
      <div
        className={`absolute left-1/2 top-1/2 z-10 flex w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 flex-col items-center p-8 text-[#333] transition-opacity delay-0 duration-500 ease-[cubic-bezier(0.445,0.05,0,1)] ${
          revealed ? "opacity-100 delay-200" : "opacity-0"
        } group-hover:opacity-100 group-hover:delay-200`}
        style={{ fontFamily: "Raleway, sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Image src="/images/about/isu-logo.png" alt="SWIMP3" width={160} height={160} className="w-2/5" />
        <h2 className="mt-4 text-xl font-semibold">SWIMP3 CentralHub</h2>

        <form onSubmit={handleSubmit} className="mt-4 w-full">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email Address"
            className="my-1.5 w-full rounded-[1px] border border-[#ccc] p-[15px] font-[inherit]"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="my-1.5 w-full rounded-[1px] border border-[#ccc] p-[15px] font-[inherit]"
          />

          {/* Real Google reCAPTCHA v2 widget renders into this div. If the
              env var isn't set yet, show a plain notice instead of a fake
              checkbox — so it's obvious setup isn't finished, rather than
              silently pretending to be real verification again. */}
          <div className="mt-3 flex w-full justify-center">
            {siteKey ? (
              <div ref={captchaContainerRef} />
            ) : (
              <p className="rounded border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                reCAPTCHA not configured — set NEXT_PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY in .env.local
              </p>
            )}
          </div>

          {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}

          {/* .bn5 — the real rainbow-glow-on-hover submit button */}
          <button type="submit" disabled={loading} className="bn5-login mt-4">
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>

        <div className="mt-2.5 text-center">
          <Link href="#" className="text-sm text-[#0d6efd] underline">
            Forgot Your Password?
          </Link>
        </div>
        <div className="mt-2.5 text-center">
          <Link href="/" className="text-sm text-[#0d6efd] underline">
            HomePage
          </Link>
        </div>
      </div>

      {/* Scoped styles for the .bn5 button — real animation from
          cssbuttoncustom.css, ported as-is (gradient glow, blur, keyframes) */}
      <style jsx>{`
        .bn5-login {
          padding: 0.6em 2em;
          border: none;
          outline: none;
          color: rgb(255, 255, 255);
          background: #111;
          cursor: pointer;
          position: relative;
          z-index: 0;
          border-radius: 10px;
          width: 100%;
        }
        .bn5-login:before {
          content: "";
          background: linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000);
          position: absolute;
          top: -2px;
          left: -2px;
          background-size: 400%;
          z-index: -1;
          filter: blur(5px);
          width: calc(100% + 4px);
          height: calc(100% + 4px);
          animation: glowingbn5login 20s linear infinite;
          opacity: 0;
          transition: opacity 0.3s ease-in-out;
          border-radius: 10px;
        }
        @keyframes glowingbn5login {
          0% {
            background-position: 0 0;
          }
          50% {
            background-position: 400% 0;
          }
          100% {
            background-position: 0 0;
          }
        }
        .bn5-login:active {
          color: #000;
        }
        .bn5-login:hover:before {
          opacity: 1;
        }
        .bn5-login:after {
          z-index: -1;
          content: "";
          position: absolute;
          width: 100%;
          height: 100%;
          background: #191919;
          left: 0;
          top: 0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}