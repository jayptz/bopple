"use client";

import { motion } from "framer-motion";

const steps = [
  { num: "01", title: "Message Bopple", detail: "Telegram or dashboard." },
  { num: "02", title: "Repo connects", detail: "GitHub OAuth, repos you pick." },
  { num: "03", title: "Code gets written", detail: "New branch, focused diff." },
  { num: "04", title: "Tests run", detail: "Build status before you see it." },
  { num: "05", title: "You merge", detail: "Nothing hits main without you." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/[0.06] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <p className="text-[13px] text-[#555]">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Five steps, one conversation
        </h2>

        <div className="mt-12 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {steps.map((step) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="grid gap-3 py-5 sm:grid-cols-[48px_1fr]"
            >
              <span className="font-mono text-[13px] text-[#555]">{step.num}</span>
              <div>
                <h3 className="text-[15px] font-medium text-white">{step.title}</h3>
                <p className="mt-0.5 text-[14px] text-[#777]">{step.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
