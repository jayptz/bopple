"use client";

const features = [
  { title: "Telegram bot", desc: "Text @BoppleBot — works like any chat." },
  { title: "Mobile dashboard", desc: "See tasks running, queued, or done." },
  { title: "Auto PR", desc: "Every task lands on a new branch." },
  { title: "BYOK", desc: "Your API key, your model bill." },
  { title: "Repo context", desc: "Indexed codebase, included in every task." },
  { title: "Async", desc: "Send it and walk away. PR comes to you." },
];

export function Features() {
  return (
    <section id="features" className="border-t border-white/[0.06] py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <p className="text-[13px] text-[#555]">Features</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          What you get
        </h2>

        <div className="mt-12 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {features.map((f) => (
            <div
              key={f.title}
              className="grid gap-2 py-5 sm:grid-cols-[200px_1fr]"
            >
              <h3 className="text-[15px] font-medium text-white">{f.title}</h3>
              <p className="text-[14px] text-[#777]">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
