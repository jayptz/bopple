"use client";

import { ReactNode } from "react";

interface LaptopFrameProps {
  children: ReactNode;
  label: string;
  tilt?: "left" | "right" | "none";
}

export function LaptopFrame({ children, label, tilt = "none" }: LaptopFrameProps) {
  const tiltStyle =
    tilt === "left"
      ? { transform: "perspective(1200px) rotateY(6deg) rotateX(1deg)" }
      : tilt === "right"
        ? { transform: "perspective(1200px) rotateY(-6deg) rotateX(1deg)" }
        : undefined;

  return (
    <figure className="w-full" style={tiltStyle}>
      <p className="mb-3 text-center text-[11px] text-[#555]">{label}</p>
      <div className="overflow-hidden rounded-t-xl border border-white/[0.08] bg-[#1C1C1C] p-2 shadow-2xl">
        <div className="aspect-[16/10] overflow-hidden rounded-md border border-white/[0.04] bg-[#0A0A0A]">
          {children}
        </div>
      </div>
      <div className="mx-auto h-2 w-[102%] -translate-x-[1%] rounded-b-md bg-[#252525]" />
      <div className="mx-auto mt-1 h-1 w-[40%] rounded-full bg-[#333]" />
    </figure>
  );
}
