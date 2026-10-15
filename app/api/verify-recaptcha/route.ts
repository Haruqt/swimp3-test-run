import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side verification for the real Google reCAPTCHA v2 checkbox on
 * /login. This has to happen server-side — the client only ever gets a
 * short-lived token from the widget, and only Google's own siteverify
 * endpoint (using OUR secret key, never exposed to the browser) can
 * confirm that token is real. Checking `token` truthiness on the client
 * alone would be trivial to fake with devtools.
 *
 * RECAPTCHA_SECRET_KEY must be set in .env.local — this is the "Secret
 * key" from https://www.google.com/recaptcha/admin (NOT the Site key,
 * which is public and goes in NEXT_PUBLIC_RECAPTCHA_SITE_KEY instead).
 */
export async function POST(req: NextRequest) {
  const { token } = (await req.json()) as { token?: string };

  if (!token) {
    return NextResponse.json({ success: false, error: "Missing reCAPTCHA token" }, { status: 400 });
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "RECAPTCHA_SECRET_KEY is not set in .env.local" },
      { status: 500 },
    );
  }

  const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  const verifyJson = (await verifyRes.json()) as { success: boolean; "error-codes"?: string[] };

  if (!verifyJson.success) {
    return NextResponse.json(
      { success: false, error: verifyJson["error-codes"]?.join(", ") ?? "reCAPTCHA verification failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}