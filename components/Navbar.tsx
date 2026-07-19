"use client";

import { motion } from "framer-motion";

const links = [
  { href: "#moments", label: "Examples" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
];

function Logo() {
  return (
    <a href="/" className="group flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2AABEE]/30 bg-gradient-to-br from-[#2AABEE]/20 to-[#3ECF8E]/10 shadow-[0_0_16px_rgba(42,171,238,0.15)] transition group-hover:border-[#2AABEE]/50">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M4 3h5.5a3 3 0 0 1 0 6H4V3zm0 6h6a3 3 0 0 1 0 6H4V9z"
            fill="url(#logo-grad)"
          />
          <defs>
            <linearGradient id="logo-grad" x1="4" y1="3" x2="12" y2="15">
              <stop stopColor="#2AABEE" />
              <stop offset="1" stopColor="#3ECF8E" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="text-[15px] font-semibold text-white">Bopple</span>
    </a>
  );
}

function NavBarContent() {
  return (
    <div className="relative flex items-center justify-between">
      <Logo />

      <nav className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-9 md:flex">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="text-[14px] text-[#8B95A8] transition hover:text-white"
          >
            {l.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-6">
        <a
          href="#quickstart"
          className="hidden text-[14px] text-[#8B95A8] transition hover:text-white sm:inline"
        >
          Docs
        </a>
        <a
          href="/login"
          className="rounded-full bg-gradient-to-r from-[#2A303C] to-[#343B48] px-5 py-2.5 text-[13px] font-medium text-white shadow-[0_0_20px_rgba(42,171,238,0.15),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:shadow-[0_0_28px_rgba(42,171,238,0.25)]"
        >
          Sign in
        </a>
      </div>
    </div>
  );
}

interface NavbarProps {
  embedded?: boolean;
  visible?: boolean;
}

export function Navbar({ embedded = false, visible = true }: NavbarProps) {
  if (embedded) {
    return (
      <header className="border-b border-white/[0.08] bg-white/[0.02] px-6 py-5 backdrop-blur-sm sm:px-10 lg:px-14">
        <NavBarContent />
      </header>
    );
  }

  return (
    <motion.header
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 right-0 left-0 z-50 ${
        visible ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6 py-6 lg:px-8">
        <NavBarContent />
      </div>
    </motion.header>
  );
}
