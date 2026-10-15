import type { Metadata } from "next";
import { Fraunces, Inter, IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Swim Project 3 | Storm Water Harvesting Facility Decision Support",
  description:
    "GIS-based decision support tool for managing urban water infrastructure with stormwater intervention — Cauayan City, Isabela.",
  icons: {
    icon: "/images/about/isu-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${playfair.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}