"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, GitPullRequest, Sparkles } from "lucide-react";

export function HeroProductVisual() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-xl">
      <div className="hero-visual-glow absolute inset-0 -z-10 scale-125 rounded-full blur-2xl" />

      <div className="grid grid-cols-2 gap-4 sm:gap-5">
        {/* Telegram */}
        <motion.div
          initial={{ rotate: -2, y: 4 }}
          animate={{ rotate: -3, y: 0 }}
          transition={{ duration: 4, repeat: Infinity, repeatType: "reverse" }}
          className="card-pop overflow-hidden rounded-2xl border border-[#2AABEE]/20 bg-[#0E1018]"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#2AABEE]/10 px-3 py-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2AABEE] text-[9px] font-bold text-white shadow-[0_0_12px_rgba(42,171,238,0.5)]">
              B
            </div>
            <span className="text-[11px] font-semibold text-white">
              @BoppleBot
            </span>
          </div>
          <div className="space-y-2.5 p-3">
            <div className="ml-auto max-w-[95%] rounded-xl rounded-br-sm bg-[#2AABEE] px-3 py-2 text-[10px] leading-snug text-white shadow-[0_4px_16px_rgba(42,171,238,0.3)]">
              fix signup validation before deploy
            </div>
            <div className="max-w-[95%] rounded-xl rounded-bl-sm border border-white/[0.06] bg-[#141824] px-3 py-2 text-[10px] text-[#C5CDD9]">
              PR #47 is open — 3 files, +89 lines
            </div>
          </div>
        </motion.div>

        {/* Dashboard */}
        <motion.div
          initial={{ rotate: 2, y: -4 }}
          animate={{ rotate: 3, y: 0 }}
          transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", delay: 0.5 }}
          className="card-pop-green overflow-hidden rounded-2xl border border-[#3ECF8E]/20 bg-[#0E1018]"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#3ECF8E]/8 px-3 py-2.5">
            <span className="text-[11px] font-semibold text-white">Tasks</span>
            <span className="rounded-full bg-[#3ECF8E]/20 px-2 py-0.5 text-[9px] font-semibold text-[#3ECF8E]">
              Done
            </span>
          </div>
          <div className="space-y-2 p-3">
            {["Read repo", "Write code", "Open PR"].map((s) => (
              <div
                key={s}
                className="flex items-center gap-2 text-[10px] text-[#9AA8BE]"
              >
                <Check className="h-3 w-3 text-[#3ECF8E]" />
                {s}
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-[#3ECF8E]/30 bg-[#3ECF8E]/10 px-2.5 py-2">
              <GitPullRequest className="h-3.5 w-3.5 text-[#3ECF8E]" />
              <span className="text-[10px] font-semibold text-[#3ECF8E]">
                PR #47
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Flow connector */}
      <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="connector-pulse flex h-10 w-10 items-center justify-center rounded-full border border-[#3ECF8E]/30 bg-[#141824] shadow-[0_0_24px_rgba(62,207,142,0.25)]">
          <ArrowRight className="h-4 w-4 text-[#3ECF8E]" />
        </div>
      </div>

      {/* Floating accents */}
      <motion.div
        animate={{ y: [0, -8, 0], rotate: [12, 18, 12] }}
        transition={{ duration: 5, repeat: Infinity }}
        className="absolute -top-8 -right-6 flex h-11 w-11 items-center justify-center rounded-xl border border-[#2AABEE]/20 bg-[#2AABEE]/10 backdrop-blur-sm"
      >
        <Sparkles className="h-4 w-4 text-[#2AABEE]" />
      </motion.div>
      <motion.div
        animate={{ y: [0, 6, 0], rotate: [-6, -12, -6] }}
        transition={{ duration: 6, repeat: Infinity, delay: 1 }}
        className="absolute -bottom-6 -left-8 h-10 w-10 rounded-lg border border-[#3ECF8E]/20 bg-[#3ECF8E]/10 backdrop-blur-sm"
      />
    </div>
  );
}
