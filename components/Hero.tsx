"use client";

import { motion } from "framer-motion";
import { Navbar } from "./Navbar";
import { HeroProductVisual } from "./HeroProductVisual";

const stats = [
  { value: "~6 min", label: "Avg. task time", accent: "#2AABEE" },
  { value: "10", label: "Free beta tasks", accent: "#3ECF8E" },
  { value: "100%", label: "You approve merges", accent: "#A78BFA" },
];

export function Hero() {
  return (
    <section className="hero-outer relative overflow-hidden px-4 pt-8 pb-10 sm:px-6 sm:pt-10 lg:px-8">
      {/* Background depth */}
      <div className="pointer-events-none absolute inset-0">
        <div className="hero-bg-orb hero-bg-orb-a" />
        <div className="hero-bg-orb hero-bg-orb-b" />
        <div className="hero-bg-orb hero-bg-orb-c" />

        <div className="hero-float-shape top-[12%] right-[8%] h-16 w-16 rotate-12 rounded-2xl" />
        <div
          className="hero-float-shape bottom-[18%] left-[6%] h-12 w-12 -rotate-6 rounded-xl"
          style={{ animationDelay: "-4s" }}
        />
        <div
          className="hero-float-shape top-[55%] right-[15%] h-8 w-8 rotate-45 rounded-md"
          style={{ animationDelay: "-8s" }}
        />

        <svg
          className="absolute inset-0 h-full w-full opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="hero-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="white"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-6xl"
      >
        <div className="hero-frame">
          <div className="hero-frame-inner">
            <Navbar embedded />

            <div className="relative min-h-[540px] px-6 py-10 sm:min-h-[600px] sm:px-10 sm:py-12 lg:min-h-[660px] lg:px-14 lg:py-14">
              {/* Top left headline */}
              <motion.h1
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
                className="relative z-10 max-w-[300px] text-[2.25rem] font-bold leading-[1.02] tracking-tight text-white sm:text-[3rem] lg:text-[3.5rem]"
              >
                Text a{" "}
                <span className="text-gradient-brand">task</span>,
              </motion.h1>

              {/* Top right description */}
              <motion.p
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25, duration: 0.5 }}
                className="relative z-10 mt-6 max-w-[300px] text-[14px] leading-relaxed text-[#9AA8BE] sm:absolute sm:top-14 sm:right-10 sm:mt-0 lg:top-16 lg:right-14 lg:max-w-[320px] lg:text-[15px]"
              >
                Async coding agent from your phone. Message Bopple on Telegram —
                it writes the code, opens a PR, and pings you when it&apos;s
                ready.
              </motion.p>

              {/* Center visual */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, duration: 0.6 }}
                className="relative z-0 my-12 flex justify-center sm:absolute sm:inset-0 sm:my-0 sm:items-center"
              >
                <HeroProductVisual />
              </motion.div>

              {/* Bottom left CTA */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.5 }}
                className="relative z-10 sm:absolute sm:bottom-28 sm:left-10 lg:bottom-32 lg:left-14"
              >
                <a
                  href="/login"
                  className="btn-primary-glow inline-flex rounded-full px-7 py-3.5 text-[14px] font-semibold text-[#0D1117] transition hover:scale-[1.02]"
                >
                  Get started
                </a>
                <a
                  href="#moments"
                  className="ml-3 inline-flex rounded-full border border-white/[0.15] bg-white/[0.04] px-7 py-3.5 text-[14px] font-medium text-[#D0D8E8] backdrop-blur-sm transition hover:border-[#2AABEE]/40 hover:bg-[#2AABEE]/10"
                >
                  See examples
                </a>
              </motion.div>

              {/* Bottom right headline */}
              <motion.h1
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="relative z-10 mt-8 text-right text-[2.25rem] font-bold leading-[1.02] tracking-tight sm:absolute sm:right-10 sm:bottom-28 sm:mt-0 sm:text-[3rem] lg:right-14 lg:bottom-32 lg:text-[3.5rem]"
              >
                Get a{" "}
                <span className="text-gradient-brand">PR.</span>
              </motion.h1>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-t border-white/[0.08] bg-black/20">
              {stats.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="group relative px-4 py-7 text-center sm:px-8 sm:py-9"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px opacity-0 transition group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${s.accent}66, transparent)`,
                    }}
                  />
                  <p className="hero-stat-value text-3xl font-bold tracking-tight sm:text-4xl">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-[11px] font-medium text-[#6B7589] sm:text-[12px]">
                    {s.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
