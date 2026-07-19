"use client";

import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    note: "Bring your own API key",
    features: ["BYOK", "Unlimited repos", "Telegram + dashboard", "10 free tasks"],
  },
  {
    name: "Pro",
    price: "$15",
    period: "/mo",
    note: "Tokens included",
    highlight: true,
    features: ["No key setup", "Unlimited repos", "Priority jobs"],
  },
  {
    name: "Team",
    price: "Contact",
    note: "Shared dashboard",
    features: ["Everything in Pro", "Team seats"],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-white/[0.06] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <p className="text-[13px] text-[#555]">Pricing</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Free with your own key
        </h2>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 ${
                plan.highlight
                  ? "border-white/[0.12] bg-[#111]"
                  : "border-white/[0.06] bg-[#0A0A0A]"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium text-white">{plan.name}</h3>
                <span className="text-xl font-semibold text-white">
                  {plan.price}
                  {plan.period && (
                    <span className="text-[13px] font-normal text-[#555]">
                      {plan.period}
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-[#666]">{plan.note}</p>
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[14px] text-[#888]">
                    <Check className="h-3.5 w-3.5 text-[#555]" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
