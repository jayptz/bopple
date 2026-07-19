"use client";

import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section id="cta" className="border-t border-white/[0.06] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="max-w-xl">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            10 free tasks. No card required.
          </h2>
          <p className="mt-3 text-[15px] text-[#888]">
            Sign in with GitHub and send your first task.
          </p>
          <a
            href="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[14px] font-medium text-[#0A0A0A] hover:bg-[#E5E5E5]"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
