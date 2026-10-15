"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const activePill = "rounded-full bg-[#3B82F6] px-6 py-2.5 text-white transition hover:bg-[#2563EB]";
const inactiveLink = "hover:text-river";

export function Navbar() {
  const [dataOpen, setDataOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isAbout = pathname === "/about";
  const isData = pathname.startsWith("/data");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDataOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="fixed left-0 right-0 top-4 z-50 px-4">
      <header className="mx-auto max-w-7xl rounded-md border border-white/20 bg-white/40 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
            <Image
              src="/images/about/isu-logo.png"
              alt="Swim Project 3"
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div>
            <span className="font-display text-lg font-bold text-ink">
              Swim Project 3 |
            </span>
            <span className="ml-2 text-sm text-ink/70">
              Storm Water Harvesting Facility Decision Support
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-10 text-sm tracking-[0.25em] text-ink">
          <Link href="/" className={isHome ? activePill : inactiveLink}>
            H o m e
          </Link>
          <Link href="/about" className={isAbout ? activePill : inactiveLink}>
            A b o u t
          </Link>

          <div className="relative" ref={wrapperRef}>
            <button
              type="button"
              onClick={() => setDataOpen((prev) => !prev)}
              className={`tracking-[0.25em] ${isData ? activePill : inactiveLink}`}
            >
              D a t a ▾
            </button>
            {dataOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
                <Link
                  href="/data/sensors"
                  onClick={() => setDataOpen(false)}
                  className="block px-4 py-3 text-sm tracking-normal hover:bg-[#EFEADD]"
                >
                  Sensors
                </Link>
                <Link
                  href="/data/maps"
                  onClick={() => setDataOpen(false)}
                  className="block px-4 py-3 text-sm tracking-normal hover:bg-[#EFEADD]"
                >
                  Maps
                </Link>
              </div>
            )}
          </div>

          <Link href="/login" className="hover:text-river">
            L o g i n
          </Link>
        </nav>
        </div>
      </header>
    </div>
  );
}