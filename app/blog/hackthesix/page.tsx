"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function HackTheSixPost() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/[0.06] py-6">
        <div className="mx-auto max-w-3xl px-6">
          <Link
            href="/blog"
            className="text-[14px] text-[#888] hover:text-white transition-colors"
          >
            ← Back to blog
          </Link>
        </div>
      </header>

      {/* Article */}
      <article className="mx-auto max-w-3xl px-6 py-16">
        {/* Draft Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <span className="inline-block rounded-md bg-yellow-500/10 px-3 py-1.5 text-[12px] font-medium uppercase tracking-wide text-yellow-500">
            Draft
          </span>
        </motion.div>

        {/* Meta */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <time className="block text-[13px] text-[#555]">
            March 15, 2024
          </time>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Building HackTheSix: Lessons from organizing Toronto&apos;s largest
            student hackathon
          </h1>
          <p className="mt-6 text-[17px] leading-relaxed text-[#AAA]">
            From 50 participants to 500+ hackers, here&apos;s what we learned
            organizing one of Canada&apos;s biggest student hackathons year
            after year.
          </p>
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="prose prose-invert mt-12 max-w-none"
        >
          <div className="space-y-6 text-[15px] leading-relaxed text-[#888]">
            <p>
              In 2018, a group of us at the University of Toronto decided to
              start a hackathon. We had no idea what we were doing, no budget,
              and definitely no sponsors lined up. What we did have was a shared
              belief that Toronto needed a better student hackathon experience.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-white">
              Year One: Learning the Hard Way
            </h2>

            <p>
              Our first HackTheSix had 50 participants in a classroom at the
              Bahen Centre. We ran out of pizza by 9 PM (classic mistake), the
              Wi-Fi crashed twice, and we had to manually review every single
              project submission on a shared Google Sheet.
            </p>

            <p>
              But something magical happened: people loved it. The energy in
              that room — hackers helping each other debug at 3 AM, mentors
              genuinely excited about student projects, teams demoing
              half-working prototypes they built in 24 hours — that&apos;s when
              we knew we had to do it again.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-white">
              Scaling Up: 50 → 200 → 500+
            </h2>

            <p>
              By year three, HackTheSix became one of the largest student
              hackathons in Canada. We moved from a single classroom to the
              entire Myhal Centre, secured sponsors like Google and Microsoft,
              and had a waitlist of 300+ students.
            </p>

            <div className="my-8 rounded-xl border border-white/[0.06] bg-[#111] p-6">
              <h3 className="text-[14px] font-medium text-white">
                Key Metrics (2018 → 2023)
              </h3>
              <ul className="mt-4 space-y-2 text-[14px] text-[#AAA]">
                <li>• Participants: 50 → 500+</li>
                <li>• Sponsors: 0 → 15+</li>
                <li>• Projects submitted: 12 → 80+</li>
                <li>• Prize pool: $0 → $25,000+</li>
              </ul>
            </div>

            <h2 className="mt-10 text-2xl font-semibold text-white">
              What We Learned
            </h2>

            <h3 className="mt-6 text-xl font-semibold text-white">
              1. Logistics Matter More Than You Think
            </h3>

            <p>
              The best hackathons aren&apos;t remembered for their keynote
              speakers or prize amounts — they&apos;re remembered because
              everything just worked. Reliable Wi-Fi, enough food, clear
              schedules, accessible bathrooms. Get the basics right first.
            </p>

            <h3 className="mt-6 text-xl font-semibold text-white">
              2. Build for First-Timers
            </h3>

            <p>
              We realized that 60% of our participants had never been to a
              hackathon before. That shifted everything — from how we
              communicated with attendees to the workshops we offered. Making
              first-timers feel welcome became our north star.
            </p>

            <h3 className="mt-6 text-xl font-semibold text-white">
              3. Community &gt; Competition
            </h3>

            <p>
              While prizes and judging are important, the real magic happens in
              the hallways. The random conversations at 2 AM, the
              interdisciplinary teams that form organically, the friendships
              that last years — that&apos;s what makes hackathons worth
              organizing.
            </p>

            <h2 className="mt-10 text-2xl font-semibold text-white">
              The Future
            </h2>

            <p>
              HackTheSix is now run by an incredible team of organizers who have
              taken it further than we ever imagined. Watching it grow from a
              scrappy classroom event to a flagship Toronto hackathon has been
              one of the most rewarding experiences of my time at UofT.
            </p>

            <p>
              If you&apos;re thinking about organizing a hackathon — or any
              community event — my advice is simple: just start. You&apos;ll
              mess things up. You&apos;ll run out of pizza. But you&apos;ll also
              create something that matters to people.
            </p>

            <p className="italic text-[#666]">
              More to come in future posts about specific challenges we faced —
              from sponsor outreach to platform selection to building a
              sustainable organizer pipeline.
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-16 border-t border-white/[0.06] pt-8"
        >
          <Link
            href="/blog"
            className="text-[14px] text-[#888] hover:text-white transition-colors"
          >
            ← Back to all posts
          </Link>
        </motion.div>
      </article>
    </div>
  );
}
