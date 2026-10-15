import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-white px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-ink/60">© SWIM. All rights reserved.</p>

        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-8 w-8">
            <Image
              src="/images/about/isu-logo.png"
              alt="Isabela State University"
              fill
              className="object-contain"
            />
          </div>
          <span className="font-display text-sm font-semibold text-ink">
            Swim Project 3
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm text-ink/70">
          <Link href="/" className="hover:text-river">Home</Link>
          <Link href="/about" className="hover:text-river">About</Link>
          <Link href="/data/maps" className="hover:text-river">Data</Link>
          <Link href="/login" className="hover:text-river">Login</Link>
        </nav>
      </div>
    </footer>
  );
}