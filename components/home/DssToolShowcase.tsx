"use client";

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

interface DssTool {
  name: string;
  specs: { label: string; value: string }[];
  definition: string;
  bgLeft: string;
  bgRight: string;
  bgAccent: string;
  /** Bottom-left block + the small top notch beside the ribbon. The
   *  version of this file we started from reused bgRight for both of
   *  these — that's only true on 3 of the 6 real slides. On Smart
   *  Water Meter, SmartQuality Meter, and Surveillance Camera, the
   *  live site's bottom-left/notch is a saturated orange-red
   *  (#F76E3E) while bgRight is orange (#F19D46) — different colors.
   *  Sampled directly from the real screenshots, hence its own field. */
  bgBL: string;
  /** "DssTools" ribbon fill. Usually equals bgRight, but on
   *  SmartQuality Meter (#46F196) and Surveillance Camera (#DAF146)
   *  it's an unrelated accent color — also sampled from the real
   *  site, also needs its own field. */
  bgRibbon: string;
  image?: string;
}

// Slides the NEW color in on top of the OLD color instead of unmounting
// and re-mounting from off-screen (which briefly exposed the raw white
// page background underneath during the transition — like lifting the
// old paper away before the new one lands, instead of sliding the new
// paper directly over the old one). The bottom layer always holds
// whatever color was last fully "landed"; the top layer animates the
// CURRENT color in over it, then bakes that color into the bottom layer
// once the slide finishes so the next transition starts from the right
// base color.
function SlideOverColor({
  color,
  runKey,
  direction,
  className,
  style,
  children,
}: {
  color: string;
  runKey: number;
  direction: "up" | "down" | "left" | "right";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [baseColor, setBaseColor] = useState(color);
  const offscreen = {
    up: { y: "100%" },
    down: { y: "-100%" },
    left: { x: "100%" },
    right: { x: "-100%" },
  }[direction];

  return (
    <div className={className} style={{ ...style, overflow: "hidden" }}>
      <div className="absolute inset-0" style={{ backgroundColor: baseColor }} />
      <motion.div
        key={runKey}
        initial={offscreen}
        animate={{ x: 0, y: 0 }}
        transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => setBaseColor(color)}
        className="absolute inset-0"
        style={{ backgroundColor: color }}
      />
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

// Colors below are pixel-sampled directly from the live site's 6
// carousel slides (screenshots), not estimated — see bgBL/bgRibbon
// comments on the interface above for why there are 5 color fields
// instead of the original 3.
const tools: DssTool[] = [
  {
    name: "Data",
    specs: [
      { label: "Interactive maps:", value: "Leaflet" },
      { label: "Mapping APIs:", value: "streetpmap, streetmap.Hot, World Imagery and World Topo." },
      { label: "Installed Sensors:", value: "PressureSensors(4), and Smart Water Meter(4)" },
    ],
    definition:
      "Sensors provide data that can be visualized on maps, offering intuitive and easy-to-understand representations of complex information.",
    bgLeft: "#F58286",
    bgRight: "#64377F",
    bgAccent: "#F58286",
    bgBL: "#FEF7CE",
    bgRibbon: "#64377F",
    image: "/images/home/luzon-map.png",
  },
  {
    name: "Smart Water Meter",
    specs: [
      { label: "Model:", value: "DN15-25" },
      { label: "Measuring range:", value: "Q3/Q1, R250" },
      { label: "Working pressure:", value: "1.6 MPa" },
      { label: "Display:", value: "LCD, 8 digits + additional characters" },
      { label: "Communication interface:", value: "RS485 modbus/ LoRa/ LoRawan/GPRS/NB-IOT" },
    ],
    definition:
      "Smart water meters provide real-time data on water usage, enabling continuous monitoring for consumers and utility companies.",
    bgLeft: "#1CC6CA",
    bgRight: "#F19D46",
    bgAccent: "#1CC6CA",
    bgBL: "#F76E3E",
    bgRibbon: "#F19D46",
    image: "/images/home/smart-water-meter.png",
  },
  {
    name: "PressureSensor",
    specs: [
      { label: "Model:", value: "Gauge pressure transmitter" },
      { label: "Output signal:", value: "4 to 20 mA DC Output with digital communication (HART protocol)" },
      { label: "Measurementspan:", value: "D - 1 to 50 MPa (145 to 7200 psi)" },
      { label: "Mounting bracket:", value: "L - 316 SST 2-inch pipe mounting" },
    ],
    definition:
      "A wireless water meter is a device that measures water usage without needing physical wires for connection.",
    bgLeft: "#EB4E4E",
    bgRight: "#4A5BB2",
    bgAccent: "#EB4E4E",
    bgBL: "#1CC6CA",
    bgRibbon: "#4A5BB2",
    image: "/images/home/pressure-sensor.png",
  },
  {
    name: "SmartQuality Meter",
    specs: [
      { label: "Model:", value: "MPG-6099r" },
      { label: "MeasurementConfig:", value: "PH/TEMP/TDS/ TURBIDITY/CL" },
      { label: "Com:", value: "RS485" },
      { label: "Power Supply:", value: "AC 220V+/-10%" },
    ],
    definition:
      "The Smart Water Quality meter checks the purity of portable water that the consumer receives, by measuring five qualitative parameters of water viz. pH, temperature, turbidity, dissolved oxygen and conductivity.",
    bgLeft: "#1CC6CA",
    bgRight: "#F19D46",
    bgAccent: "#6559EB",
    bgBL: "#F76E3E",
    bgRibbon: "#46F196",
    image: "/images/home/smartquality-meter.png",
  },
  {
    name: "Surveillance Camera",
    specs: [
      { label: "Special Features:", value: "Human Motion Tracking, NIGHT VISION, Motion Detection, Sound Detection, Two-way Audio" },
      { label: "Function:", value: "Two-way Audio, PAN-TILT, RESET, NIGHT VISION" },
      { label: "Style:", value: "Dome Camera, PTZ camera" },
    ],
    definition:
      "Is a TV system in which signals are not publicly distributed but are monitored, primarily for surveillance and security purposes. CCTV relies on strategic placement of cameras and private observation of the camera's input on monitors.",
    bgLeft: "#1CC6CA",
    bgRight: "#F19D46",
    bgAccent: "#1CCA42",
    bgBL: "#F76E3E",
    bgRibbon: "#DAF146",
    image: "/images/home/surveillance-camera.png",
  },
  {
    name: "MIKE Operations",
    specs: [
      {
        label: "MIKE Workbench:",
        value:
          "an advanced desktop client, designed for expert users who apply data analysis and process tools interactively and are able to configure automated workflows, scripts and custom-made data reports.",
      },
    ],
    definition:
      "Designed for users who need a quick overview of the operational system status and who need to test operational alternatives.",
    bgLeft: "#F58286",
    bgRight: "#64377F",
    bgAccent: "#F19D46",
    bgBL: "#FEF7CE",
    bgRibbon: "#64377F",
    image: "/images/home/mike-logo.png",
  },
];

const AUTO_ADVANCE_MS = 5000;

export function DssToolShowcase() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const runId = useRef(0);

  const goTo = (index: number) => {
    runId.current += 1;
    setActive(((index % tools.length) + tools.length) % tools.length);
    setTick((t) => t + 1);
  };

  const goNext = () => goTo(active + 1);

  useEffect(() => {
    const interval = setInterval(() => {
      runId.current += 1;
      setActive((prev) => (prev + 1) % tools.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [tick]);

  const tool = tools[active];
  const runKey = runId.current; // forces each panel to replay its own entrance every switch

  return (
    <section className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
      {/* Background — plain rectangles, no diagonal anywhere.
          The notch and the ribbon inside the card MUST share the same
          width (200px = half of the card's 400px) and both anchor off
          the card's own right-1/2 center line — otherwise one is
          sized relative to the viewport and the other relative to
          the card, and they only coincidentally line up at one
          specific screen width instead of always. */}
      {/* Background — 4 zones:
          1. top-left big block: tool.bgLeft
          2. small notch (between zone 1 and the ribbon): tool.bgBL
          3. bottom-left square: tool.bgBL
          4. whole right side: tool.bgRight
          zones 2 and 3 are NOT always the same as zone 4 (bgRight) —
          see the bgBL comment on the interface above. */}
      <SlideOverColor
        color={tool.bgLeft}
        runKey={runKey}
        direction="down"
        className="absolute left-0 top-0 h-1/2 w-[calc(50%-200px)]"
      />
      <SlideOverColor
        color={tool.bgBL}
        runKey={runKey}
        direction="right"
        className="absolute right-1/2 top-0 h-[4%] w-[200px]"
      />
      <SlideOverColor
        color={tool.bgBL}
        runKey={runKey}
        direction="down"
        className="absolute bottom-0 left-0 h-1/2 w-1/2"
      />
      <SlideOverColor
        color={tool.bgRight}
        runKey={runKey}
        direction="down"
        className="absolute inset-y-0 right-0 w-1/2"
      />

      {/* Content card. The white and color panels are each absolutely
          positioned off the SAME center line as the background split
          (`right-1/2` / `left-1/2` of this full-width wrapper) — so
          the card's seam always lines up with where the background
          changes color. */}
      <div className="relative z-[1] h-[600px] w-full max-w-[1400px] px-4">
        {/* LEFT: white specs card — fixed landscape height (was
            stretched to 92% of the viewport, touching top and bottom;
            the original reference is a shorter, wider card centered in
            the section, not a full-height panel). Widened from 300px to
            340px so the card reads as clearly landscape (680px combined
            width vs 440px height) rather than square. */}
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-white md:absolute md:inset-y-0 md:right-1/2 md:w-[400px]">
          {/* DssTools ribbon — floats as an overlay INSET into the
              card's own top-left corner (per the reference), instead of
              being a normal flex-flow child that pushed the rest of the
              card's content down and rendered outside the card's white
              area entirely. `absolute` + the card wrapper's own
              `relative` positioning is what actually pins it inside the
              card's bounds now. */}
          <SlideOverColor
            color={tool.bgRibbon}
            runKey={runKey}
            direction="up"
            className="absolute left-0 top-0 z-10 w-1/2"
          >
            <span className="block px-8 py-4 font-display text-2xl font-bold text-white">DssTools</span>
          </SlideOverColor>

          {/* pt-16 clears space for the floating ribbon above so it no
              longer overlaps the specs content beneath it. */}
          <div className="relative flex flex-1 pt-16">
            <div className="absolute left-4 top-16 flex h-[calc(100%-4rem)] items-center">
              <span
                className="whitespace-nowrap font-display text-3xl text-ink/10"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                classification
              </span>
            </div>

            {/* Extra right padding (pr-16) so the seam-centered image
                never overlaps the longer spec values */}
            <div className="flex flex-1 items-center justify-center pl-20 pr-10">
              <motion.div
                key={`specs-${runKey}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.55 }}
                className="w-full space-y-5"
              >
                {tool.specs.map((spec) => (
                  <div key={spec.label}>
                    <p className="font-semibold text-ink/80">{spec.label}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink/60">{spec.value}</p>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* RIGHT: solid color, title + definition. Wrapped together
            with the Next button in one 400px-wide positioned box, so
            the button is always anchored to this panel's own corner
            instead of the much wider outer wrapper (which is why it
            used to float outside the visible card at wide viewports —
            it was positioned off a 1400px-wide ancestor while the
            actual card was only 800px wide). */}
        <div className="relative hidden md:absolute md:inset-y-0 md:left-1/2 md:block md:w-[400px]">
          <SlideOverColor
            color={tool.bgAccent}
            runKey={runKey}
            direction="up"
            className="relative h-full shadow-xl md:flex md:items-center"
          >
            <motion.div
              key={`text-${runKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.55 }}
              className="relative z-20 py-8 pl-32 pr-6"
            >
              {/* font-showcase (Playfair Display) + text-3xl/font-normal
                  matches the live site's heading — a plain, thinner-
                  contrast serif at ~32px cap-height, not the site's own
                  Fraunces display face at 48px, which is what this was
                  set to before. */}
              <h2 className="font-showcase text-3xl font-normal leading-tight text-white">
                {tool.name}
              </h2>
              <p className="mt-4 font-semibold text-white">Definition:</p>
              <p className="mt-2 leading-relaxed text-white/90">{tool.definition}</p>
            </motion.div>
          </SlideOverColor>

          {/* Next button — anchored to this same panel, so it always
              sits inside the visible card's own corner. */}
          <button
            onClick={goNext}
            aria-label="Next"
            className="absolute bottom-6 right-6 z-20 flex h-[30px] w-[30px] items-center justify-center rounded-full text-white shadow-[0_0_0_1px_#fff] transition hover:bg-white/20"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21s-7.5-4.6-9.8-9.2C.6 8.3 2 4.9 5.4 4.1c2-.5 4 .4 5.1 2 1.1-1.6 3.1-2.5 5.1-2 3.4.8 4.8 4.2 3.2 7.7C19.5 16.4 12 21 12 21z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Product image — centered exactly on the seam.
            IMPORTANT: the centering transform (-translate-x-1/2) and the
            entrance animation now live on TWO SEPARATE elements. Framer
            Motion takes full ownership of the `transform` CSS property on
            any element it animates — so when this was a single motion.div
            with both the Tailwind -translate-x-1/2 class AND an animated
            y value, Framer's own generated transform silently replaced the
            Tailwind one entirely. The box's *left edge* ended up on the
            seam instead of its *center*, which is why the image always
            rendered shifted into the right panel instead of straddling
            the middle. */}
        {tool.image && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 my-auto h-48 w-48 -translate-x-1/2 md:h-64 md:w-64">
            <motion.div
              key={`image-${runKey}`}
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.85, ease: "easeOut" }}
              className="relative h-full w-full"
            >
              <Image
                src={tool.image}
                alt={tool.name}
                fill
                className="object-contain drop-shadow-2xl"
              />
            </motion.div>
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {tools.map((t, i) => (
          <button
            key={t.name}
            onClick={() => goTo(i)}
            aria-label={`Show ${t.name}`}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === active ? "28px" : "8px",
              backgroundColor: i === active ? "white" : "rgba(0,0,0,0.15)",
            }}
          />
        ))}
      </div>
    </section>
  );
}