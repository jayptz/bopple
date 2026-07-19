"use client";

import { motion } from "framer-motion";

interface SectionHeaderProps {
  label?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}

export function SectionHeader({
  label,
  title,
  description,
  align = "center",
}: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}
    >
      {label && (
        <p className="text-[13px] font-medium tracking-wide text-[#71717A] uppercase">
          {label}
        </p>
      )}
      <h2
        className={`font-semibold tracking-tight text-white ${label ? "mt-3" : ""} text-3xl sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]`}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-[17px] leading-relaxed text-[#A1A1AA]">
          {description}
        </p>
      )}
    </motion.div>
  );
}
