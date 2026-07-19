import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bopple — Text a task. Get a PR.",
  description:
    "Async coding agent for your phone. Send a task from Telegram or the dashboard — Bopple writes the code, opens a PR, and pings you when it's ready.",
  openGraph: {
    title: "Bopple — Text a task. Get a PR.",
    description:
      "Async coding agent for your phone. Telegram-native, BYOK-friendly, human-in-the-loop.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#08090D] text-[#EDEDED]">
        {children}
      </body>
    </html>
  );
}
