"use client";

import { motion } from "framer-motion";

const stats = [
  { label: "Avg. task → PR", value: "~6 min" },
  { label: "Interface", value: "Telegram + web" },
  { label: "Merge policy", value: "You approve" },
  { label: "Beta offer", value: "10 free tasks" },
];

export function StatusStrip() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-4"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-[#101012] px-5 py-4"
        >
          <p className="text-[11px] text-[#52525B]">{stat.label}</p>
          <p className="mt-1 font-mono text-[14px] text-white">{stat.value}</p>
        </div>
      ))}
    </motion.div>
  );
}
