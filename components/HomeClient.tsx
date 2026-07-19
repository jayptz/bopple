"use client";

import { IntroExperience } from "@/components/Intro/IntroExperience";
import { LifeMoments } from "@/components/LifeMoments";
import { Philosophy } from "@/components/Philosophy";
import { HowItWorks } from "@/components/HowItWorks";
import { ProductShowcase } from "@/components/ProductShowcase";
import { Features } from "@/components/Features";
import { Quickstart } from "@/components/Quickstart";
import { Pricing } from "@/components/Pricing";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export function HomeClient() {
  return (
    <>
      <main>
        <IntroExperience />
        <LifeMoments />
        <Philosophy />
        <HowItWorks />
        <ProductShowcase />
        <Features />
        <Quickstart />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
