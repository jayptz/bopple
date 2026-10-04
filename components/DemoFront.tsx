"use client";

import { Navbar } from "@/components/Navbar";

export function DemoFront() {
  return (
    <section
      id="demo"
      className="bg-zinc-950 px-4 pt-4 pb-6 sm:px-6 sm:pt-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <Navbar embedded />

        <div className="flex min-h-[calc(100dvh-2rem)] flex-col justify-center px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
          <p className="text-[12px] font-medium tracking-wide text-zinc-500 uppercase">
            Demo
          </p>
          <h1 className="mt-2 max-w-xl text-[2rem] font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
            Text a task.{" "}
            <span className="text-gradient-brand">Get a PR.</span>
          </h1>
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-zinc-400 sm:text-[15px]">
            A real Bopple run, from the Telegram message to the pull request.
          </p>

          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <video
              className="aspect-video h-auto max-h-[70vh] w-full bg-black object-contain"
              src="/bopple-demo.mp4"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Bopple demo: text a task and get a pull request"
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <a
            href="#writeup"
            className="mt-5 inline-flex w-fit items-center text-[14px] font-medium text-zinc-300 underline-offset-4 transition hover:text-white hover:underline"
          >
            Read the technical writeup
          </a>
        </div>
      </div>
    </section>
  );
}
