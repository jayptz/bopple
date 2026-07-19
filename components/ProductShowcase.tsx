"use client";

import { ScreenshotSlot } from "@/components/ui/ScreenshotSlot";

export function ProductShowcase() {
  return (
    <section id="product" className="border-t border-white/[0.06] bg-[#0D0D0D] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-[13px] text-[#555]">The product</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Telegram to talk.
              <br />
              Dashboard to track.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#888]">
              Send tasks from @BoppleBot. See status, diffs, and history on the
              mobile dashboard. Same flow either way.
            </p>
            <ul className="mt-8 space-y-3 text-[14px] text-[#777]">
              <li className="flex gap-2">
                <span className="text-[#555]">—</span>
                Message a task in plain English
              </li>
              <li className="flex gap-2">
                <span className="text-[#555]">—</span>
                Get pinged when the PR is ready
              </li>
              <li className="flex gap-2">
                <span className="text-[#555]">—</span>
                Review and merge from your phone
              </li>
            </ul>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <ScreenshotSlot label="Telegram chat" aspect="phone" />
            <ScreenshotSlot label="Task dashboard" aspect="phone" />
          </div>
        </div>
      </div>
    </section>
  );
}
