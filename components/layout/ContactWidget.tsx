"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/** Site-wide floating "contact us" widget: a fixed envelope button in
 *  the bottom-right corner that opens a centered modal on click. The
 *  modal is a white card split into a form (left) and a solid
 *  yellow/orange panel (right) carrying the project email — the two
 *  are divided by a wavy S-curve rather than a straight line, drawn
 *  with an SVG path stretched (preserveAspectRatio="none") to the
 *  panel's actual height so the curve holds its shape at any card
 *  height.
 *
 *  Matches the original site's popup: same copy, same Name / Work
 *  Email / Message fields, same "We're here for you" panel. The
 *  original posts to Squarespace's own form backend, which isn't
 *  something this rebuild can call — so this reproduces it as a
 *  working client-side form (validates, shows a confirmation state)
 *  without a server behind it yet. Wire it to a real destination
 *  (Supabase table, email API, etc.) whenever that's ready. */
export function ContactWidget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Lock page scroll while the modal is open, and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  function handleClose() {
    setOpen(false);
    // Reset a beat after the close so the form doesn't visibly reset
    // while the modal is still fading/visible.
    setTimeout(() => {
      setSubmitted(false);
      setName("");
      setEmail("");
      setMessage("");
    }, 200);
  }

  return (
    <>
      {/* Floating trigger button — gold square, dark icon, matching the
          original's envelope button (not a dark button with a light
          icon and gold outline). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Contact us"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD966] to-[#F0A93E] text-ink shadow-lg ring-1 ring-black/10 transition hover:brightness-105"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="m4 6.5 8 6.5 8-6.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleClose}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-mist shadow transition hover:bg-sand"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="grid md:grid-cols-5">
              {/* Left: form */}
              <div className="p-8 sm:p-10 md:col-span-3">
                <h2 className="text-center text-2xl font-bold tracking-wide text-ink sm:text-3xl">
                  CONTACT US
                </h2>
                <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-ink/60">
                  Let&apos;s get this conversation started. Tell us a bit
                  about yourself, and well get in touch as soon as we
                  can.
                </p>

                {submitted ? (
                  <div className="mt-8 rounded-xl bg-mist px-5 py-6 text-center text-sm text-ink/80">
                    Thanks — your message has been received. We&apos;ll get
                    back to you soon.
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="cw-name" className="text-sm text-ink/80">
                        Name
                      </label>
                      <input
                        id="cw-name"
                        type="text"
                        required
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-ink/20 px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-river focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="cw-email" className="text-sm text-ink/80">
                        Work Email
                      </label>
                      <input
                        id="cw-email"
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-ink/20 px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-river focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="cw-message" className="text-sm text-ink/80">
                        Message
                      </label>
                      <textarea
                        id="cw-message"
                        required
                        rows={4}
                        placeholder="Message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="mt-1.5 w-full resize-none rounded-md border border-ink/20 px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-river focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-md bg-gradient-to-r from-[#FFD966] to-[#F5A623] py-3 text-sm font-semibold text-ink/90 transition hover:brightness-105"
                    >
                      Contact us
                    </button>
                  </form>
                )}
              </div>

              {/* Right: wavy yellow panel */}
              <div className="relative hidden min-h-[420px] md:col-span-2 md:block">
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 40 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path
                    d="M25,0 C15,18 15,38 25,50 C35,62 35,82 25,100 L40,100 L40,0 Z"
                    fill="#F9BC35"
                  />
                </svg>
                <div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
                  <div className="relative h-16 w-16 shrink-0">
                    <Image
                      src="/images/about/isu-logo.png"
                      alt="Isabela State University"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-ink">
                    We&apos;re here for you&apos;
                  </h3>
                  <p className="mt-2 text-sm tracking-wide text-ink/70">
                    Questions?We have answer.
                  </p>
                  <a
                    href="mailto:project.swim3@isu.edu.ph"
                    className="mt-1 text-sm font-medium tracking-wide text-ink/80 hover:text-ink"
                  >
                    project.swim3@isu.edu.ph
                  </a>
                </div>
              </div>

              {/* Mobile fallback: same info, stacked below the form
                  without the wave (SVG hidden below md above) */}
              <div className="flex flex-col items-center gap-1 border-t border-ink/10 bg-[#F9BC35] px-8 py-8 text-center md:hidden">
                <div className="relative h-14 w-14">
                  <Image
                    src="/images/about/isu-logo.png"
                    alt="Isabela State University"
                    fill
                    className="object-contain"
                  />
                </div>
                <h3 className="mt-3 text-lg font-bold text-ink">
                  We&apos;re here for you&apos;
                </h3>
                <p className="mt-1 text-sm text-ink/70">Questions?We have answer.</p>
                <a
                  href="mailto:project.swim3@isu.edu.ph"
                  className="text-sm font-medium text-ink/80"
                >
                  project.swim3@isu.edu.ph
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}