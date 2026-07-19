"use client";

import { motion } from "framer-motion";

export function Philosophy() {
  return (
    <section id="philosophy" className="py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <blockquote className="text-2xl font-medium leading-snug tracking-tight text-white sm:text-3xl">
            You shouldn&apos;t need a laptop to unblock your team.
          </blockquote>
          <p className="mt-6 text-[16px] leading-relaxed text-[#888]">
            Bopple handles the implementation — branch, code, PR, notification.
            You stay in control of what merges. It&apos;s async on purpose: send
            a message, go back to what you were doing.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
