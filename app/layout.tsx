import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
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
