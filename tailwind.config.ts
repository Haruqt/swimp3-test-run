import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#12303B",
        river: "#2E7D8C",
        "river-light": "#5CA3AF",
        clay: "#C1622D",
        "clay-light": "#E0A272",
        sand: "#EFE7D8",
        mist: "#F6F4EF",
        moss: "#5C7A5C",
        "moss-light": "#8FAE8B",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        showcase: ["var(--font-playfair)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        droplet: "0 50% 50% 50%",
      },
    },
  },
  plugins: [],
};
export default config;