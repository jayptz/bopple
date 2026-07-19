"use client";

const steps = [
  {
    n: "1",
    title: "Sign in with GitHub",
    desc: "One click — OAuth, no config files.",
  },
  {
    n: "2",
    title: "Connect Telegram",
    desc: "Chat with @BoppleBot and link your account.",
  },
  {
    n: "3",
    title: "Add API key or subscribe",
    desc: "BYOK free, or Pro at $15/mo.",
  },
  {
    n: "4",
    title: "Send your first task",
    desc: "Text what you need. Come back to a PR.",
  },
];

export function Quickstart() {
  return (
    <section id="quickstart" className="border-t border-white/[0.06] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="max-w-xl">
          <p className="text-[13px] font-medium tracking-wide text-[#525252] uppercase">
            Quickstart
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Four steps to your first PR
          </h2>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {steps.map((step) => (
            <div
              key={step.n}
              className="flex gap-4 rounded-xl border border-white/[0.06] p-6"
            >
              <span className="font-mono text-[13px] text-[#525252]">
                {step.n}
              </span>
              <div>
                <h3 className="text-[15px] font-medium text-white">
                  {step.title}
                </h3>
                <p className="mt-1 text-[14px] text-[#737373]">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
