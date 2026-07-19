"use client";

import { motion } from "framer-motion";

const moments = [
  {
    when: "On vacation",
    where: "Beach house · Portugal",
    task: "Fix signup validation before Monday deploy",
    detail:
      "Laptop stayed in the bag. PR was ready before dinner.",
    time: "6 min",
  },
  {
    when: "At a wedding",
    where: "Out of town · no Wi‑Fi for coding",
    task: "Patch the broken checkout flow",
    detail:
      "Texted Bopple between courses. Merged from the hotel lobby.",
    time: "8 min",
  },
  {
    when: "Commuting",
    where: "Train · phone only",
    task: "Add dark mode toggle to settings",
    detail:
      "Sent it leaving the station. Reviewed the diff at the next stop.",
    time: "5 min",
  },
];

export function LifeMoments() {
  return (
    <section id="moments" className="border-t border-white/[0.06] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="max-w-xl">
          <p className="text-[13px] text-[#555]">Real usage</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Life doesn&apos;t pause for bugs
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#888]">
            Bopple is for the weeks you&apos;re not at your desk — but your
            repo still needs you.
          </p>
        </div>

        <div className="mt-14 space-y-4">
          {moments.map((m, i) => (
            <motion.article
              key={m.when}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="grid gap-4 rounded-xl border border-white/[0.06] bg-[#111] p-6 sm:grid-cols-[140px_1fr_auto] sm:items-center sm:gap-8"
            >
              <div>
                <p className="text-[14px] font-medium text-white">{m.when}</p>
                <p className="mt-0.5 text-[12px] text-[#555]">{m.where}</p>
              </div>
              <div>
                <p className="font-mono text-[13px] text-[#AAA]">
                  &ldquo;{m.task}&rdquo;
                </p>
                <p className="mt-2 text-[14px] text-[#777]">{m.detail}</p>
              </div>
              <p className="text-[13px] text-[#555] sm:text-right">
                {m.time}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
