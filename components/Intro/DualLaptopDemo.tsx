"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  GitBranch,
  GitPullRequest,
  Loader2,
  Send,
} from "lucide-react";
import { LaptopFrame } from "./LaptopFrame";

export type DemoStep = 0 | 1 | 2 | 3 | 4;

interface DualLaptopDemoProps {
  step: DemoStep;
  ready?: boolean;
}

const pipeline = [
  { id: "read", label: "Read repo" },
  { id: "write", label: "Write code" },
  { id: "pr", label: "Open PR" },
  { id: "notify", label: "Notify you" },
];

export function DualLaptopDemo({ step, ready = false }: DualLaptopDemoProps) {
  const pipelineIndex = step - 1;

  return (
    <div className="relative w-full max-w-5xl">
      {/* Connector */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
        <motion.div
          animate={{
            opacity: step >= 1 ? 1 : 0.3,
            scale: ready ? 1.1 : 1,
          }}
          className="flex flex-col items-center gap-2"
        >
          <div className="relative h-px w-16 overflow-hidden bg-white/[0.06]">
            <motion.div
              className="absolute inset-y-0 left-0 bg-[#3ECF8E]"
              animate={{ width: ready ? "100%" : `${Math.min(100, (step / 4) * 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          {ready ? (
            <span className="rounded-full bg-[#3ECF8E]/15 px-3 py-1 text-[10px] font-medium text-[#3ECF8E]">
              Ready
            </span>
          ) : step >= 1 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#555]" />
          ) : (
            <Send className="h-3.5 w-3.5 text-[#444]" />
          )}
        </motion.div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Left — Telegram */}
        <LaptopFrame label="You · Telegram" tilt="left">
          <div className="flex h-full flex-col text-[11px]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2AABEE] text-[9px] font-bold text-white">
                B
              </div>
              <div>
                <p className="font-medium text-white">@BoppleBot</p>
                <p className="text-[9px] text-[#555]">online</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-2 p-3">
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-xl rounded-br-sm bg-[#2AABEE] px-2.5 py-2 text-white">
                  add input validation to signup — empty fields & bad emails
                </div>
              </div>

              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div className="rounded-xl rounded-bl-sm bg-[#1A1A1A] px-3 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#555]" />
                    </div>
                  </motion.div>
                )}

                {step >= 1 && step < 4 && (
                  <motion.div
                    key="working"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl rounded-bl-sm bg-[#1A1A1A] px-2.5 py-2 text-[#AAA]"
                  >
                    On it — working on your repo now.
                  </motion.div>
                )}

                {(step >= 4 || ready) && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl rounded-bl-sm bg-[#1A1A1A] px-2.5 py-2.5"
                  >
                    <p className="text-[#DDD]">
                      Done — PR #47 is open. 3 files, +89 lines.
                    </p>
                    <p className="mt-1 font-mono text-[9px] text-[#3ECF8E]">
                      feat/signup-validation
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-white/[0.06] p-2">
              <div className="rounded-full bg-[#141414] px-3 py-1.5 text-[10px] text-[#555]">
                Message
              </div>
            </div>
          </div>
        </LaptopFrame>

        {/* Right — Dashboard */}
        <LaptopFrame label="Bopple · Dashboard" tilt="right">
          <div className="flex h-full flex-col text-[11px]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <p className="font-medium text-white">Tasks</p>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] ${
                  ready || step >= 4
                    ? "bg-[#3ECF8E]/15 text-[#3ECF8E]"
                    : step >= 1
                      ? "bg-[#2AABEE]/15 text-[#2AABEE]"
                      : "bg-white/[0.04] text-[#555]"
                }`}
              >
                {ready || step >= 4
                  ? "Complete"
                  : step >= 1
                    ? "Running"
                    : "Waiting"}
              </span>
            </div>

            <div className="flex-1 space-y-2 p-3">
              <div className="rounded-lg border border-white/[0.06] bg-[#111] p-2.5">
                <p className="font-medium text-white">Signup validation</p>
                <p className="mt-0.5 font-mono text-[9px] text-[#555]">
                  acme/web-app · main
                </p>
              </div>

              <div className="space-y-1">
                {pipeline.map((item, i) => {
                  const done = pipelineIndex > i || step >= 4 || ready;
                  const active = pipelineIndex === i && step >= 1 && step < 4;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                        active ? "bg-white/[0.04]" : ""
                      }`}
                    >
                      {done ? (
                        <Check className="h-3 w-3 text-[#3ECF8E]" />
                      ) : active ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[#888]" />
                      ) : (
                        <div className="h-3 w-3 rounded-full border border-white/[0.1]" />
                      )}
                      <span
                        className={
                          done
                            ? "text-[#888]"
                            : active
                              ? "text-[#CCC]"
                              : "text-[#555]"
                        }
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <AnimatePresence>
                {step >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="overflow-hidden"
                  >
                    <p className="mb-1 text-[9px] text-[#555] uppercase">
                      Files changed
                    </p>
                    <div className="space-y-1 font-mono text-[9px]">
                      <p className="text-[#888]">
                        src/components/SignupForm.tsx{" "}
                        <span className="text-[#3ECF8E]">+42</span>
                      </p>
                      <p className="text-[#888]">
                        src/lib/validation.ts{" "}
                        <span className="text-[#3ECF8E]">+31</span>
                      </p>
                      {step >= 3 && (
                        <p className="text-[#888]">
                          src/__tests__/signup.test.ts{" "}
                          <span className="text-[#3ECF8E]">+16</span>
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {(step >= 3 || ready) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-lg border border-[#3ECF8E]/20 bg-[#3ECF8E]/5 px-2.5 py-2"
                  >
                    <GitPullRequest className="h-3.5 w-3.5 text-[#3ECF8E]" />
                    <div>
                      <p className="font-medium text-[#3ECF8E]">PR #47 open</p>
                      <p className="flex items-center gap-1 text-[9px] text-[#666]">
                        <GitBranch className="h-2.5 w-2.5" />
                        feat/signup-validation → main
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </LaptopFrame>
      </div>
    </div>
  );
}
