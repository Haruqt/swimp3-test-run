"use client";

import { useState } from "react";
import Image from "next/image";

/** Matches the original site's Contact Us block: Name / Work Email /
 *  Message form with an arrow "Contact us" submit button, paired with
 *  a "We're here for you" panel carrying the project email. Built as
 *  a floating card that overlaps the hero band underneath it (same
 *  layered, color-blocked, shadow-heavy language as DssToolShowcase
 *  and the hazard map cards elsewhere on this site) instead of a flat
 *  stacked section — this is meant to be placed directly after the
 *  hero, with the hero given extra bottom padding so the card has
 *  room to sit half over it.
 *
 *  The original is a Squarespace form posting to Squarespace's own
 *  backend, which isn't something this rebuild can call — so this
 *  reproduces the copy and layout as a working client-side form
 *  (validates + shows a confirmation state) without a server behind
 *  it yet. Wire it to a real destination (Supabase table, email API,
 *  etc.) whenever that's ready. */
export function ContactSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <section className="relative z-10 -mt-24 px-6 sm:-mt-28">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 md:grid-cols-5">
        {/* Left: form — 3/5 width on desktop */}
        <div className="p-8 sm:p-12 md:col-span-3">
          <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            Contact Us
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink/70">
            Let&apos;s get this conversation started. Tell us a bit about
            yourself, and we&apos;ll get in touch as soon as we can.
          </p>

          {submitted ? (
            <div className="mt-8 rounded-xl bg-mist px-5 py-4 text-sm text-ink/80">
              Thanks — your message has been received. We&apos;ll get back to you soon.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div>
                <label htmlFor="contact-name" className="text-sm font-medium text-ink/70">
                  Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full border-0 border-b-2 border-ink/15 bg-transparent pb-2 text-ink transition focus:border-river focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="text-sm font-medium text-ink/70">
                  Work Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full border-0 border-b-2 border-ink/15 bg-transparent pb-2 text-ink transition focus:border-river focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="contact-message" className="text-sm font-medium text-ink/70">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1.5 w-full resize-none border-0 border-b-2 border-ink/15 bg-transparent pb-2 text-ink transition focus:border-river focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="group flex items-center gap-2.5 rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-mist shadow-lg shadow-ink/20 transition hover:bg-river hover:shadow-river/30"
              >
                Contact us
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="transition group-hover:translate-x-1"
                >
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </form>
          )}
        </div>

        {/* Right: "We're here for you" panel — solid color block, 2/5
            width, matches the color-blocked panel language used in
            DssToolShowcase and the login page's corner accents. */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-river to-[#12303B] p-10 text-center md:col-span-2">
          {/* Droplet accent — reuses the site's own droplet radius token */}
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-droplet bg-white/5" aria-hidden />
          <div className="absolute -bottom-14 -left-10 h-44 w-44 rounded-droplet bg-white/5" aria-hidden />

          <div className="relative z-10 flex flex-col items-center">
            <div className="relative h-14 w-14 overflow-hidden rounded-full bg-white/10 p-2">
              <Image
                src="/images/home/swim_project3_logo.png"
                alt="Swim Project 3"
                fill
                className="object-contain p-1"
              />
            </div>
            <h3 className="mt-6 font-display text-2xl font-semibold text-white">
              We&apos;re here for you
            </h3>
            <p className="mt-2 text-white/70">Questions? We have answers.</p>
            <a
              href="mailto:project.swim3@isu.edu.ph"
              className="mt-5 inline-block rounded-full bg-white/10 px-5 py-2.5 font-medium text-white underline decoration-white/40 underline-offset-4 transition hover:bg-white/20 hover:decoration-white"
            >
              project.swim3@isu.edu.ph
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}