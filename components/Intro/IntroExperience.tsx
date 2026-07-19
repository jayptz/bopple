"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DualLaptopDemo, type DemoStep } from "./DualLaptopDemo";
import { Hero } from "@/components/Hero";

const STEP_MS = 2200;
const READY_MS = 1800;
const FADE_MS = 800;

type Scene = "demo" | "ready" | "fadeout" | "landing";

interface IntroExperienceProps {
  onComplete?: () => void;
}

export function IntroExperience({ onComplete }: IntroExperienceProps) {
  const [step, setStep] = useState<DemoStep>(0);
  const [scene, setScene] = useState<Scene>("demo");

  const advance = useCallback(() => {
    setStep((s) => {
      if (s >= 4) {
        setScene("ready");
        return s;
      }
      return (s + 1) as DemoStep;
    });
  }, []);

  useEffect(() => {
    if (scene === "landing") {
      onComplete?.();
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = scene === "fadeout" ? "hidden" : "hidden";

    if (scene === "ready") {
      const t = setTimeout(() => setScene("fadeout"), READY_MS);
      return () => clearTimeout(t);
    }

    if (scene === "fadeout") {
      const t = setTimeout(() => setScene("landing"), FADE_MS);
      return () => clearTimeout(t);
    }

    const t = setTimeout(advance, STEP_MS);
    return () => clearTimeout(t);
  }, [scene, step, advance, onComplete]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const showDemo = scene === "demo" || scene === "ready" || scene === "fadeout";

  return (
    <>
      {/* Fullscreen intro demo */}
      <AnimatePresence>
        {showDemo && (
          <motion.section
            key="intro-demo"
            initial={{ opacity: 1 }}
            animate={{ opacity: scene === "fadeout" ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FADE_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0A0A0A] px-4 py-16 sm:px-6"
          >
            <div className="table-surface w-full max-w-5xl rounded-2xl px-4 py-8 sm:px-8 sm:py-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene === "ready" ? "ready" : step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mb-8 text-center"
                >
                  {scene === "ready" ? (
                    <>
                      <p className="text-[13px] text-[#3ECF8E]">Request ready</p>
                      <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                        Your PR is waiting — review whenever you want
                      </h2>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] text-[#555]">
                        {step === 0 && "You send a task"}
                        {step === 1 && "Bopple reads your repo"}
                        {step === 2 && "Bopple writes the code"}
                        {step === 3 && "PR opens on GitHub"}
                        {step === 4 && "You get notified"}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                        Message on the left. Work happens on the right.
                      </h2>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              <DualLaptopDemo step={step} ready={scene === "ready"} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Landing hero — always in DOM, revealed after demo */}
      <section id="intro">
        <AnimatePresence>
          {scene === "landing" && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <Hero />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
}
