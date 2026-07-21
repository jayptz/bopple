"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  draft: boolean;
  slug: string;
}

const posts: BlogPost[] = [
  {
    id: "1",
    title: "Building HackTheSix: Lessons from organizing Toronto's largest student hackathon",
    excerpt:
      "From 50 participants to 500+ hackers, here's what we learned organizing one of Canada's biggest student hackathons year after year.",
    date: "2024-03-15",
    draft: true,
    slug: "hackthesix",
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/[0.06] py-6">
        <div className="mx-auto max-w-4xl px-6">
          <Link
            href="/"
            className="text-[14px] text-[#888] hover:text-white transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Blog
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#888]">
            Thoughts on building products, organizing communities, and shipping
            code.
          </p>
        </div>

        {/* Posts List */}
        <div className="space-y-8">
          {posts.map((post, i) => (
            <motion.article
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="group relative"
            >
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-xl border border-white/[0.06] bg-[#111] p-6 transition-all hover:border-white/[0.12] hover:bg-[#151515]"
              >
                {post.draft && (
                  <span className="mb-3 inline-block rounded-md bg-yellow-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-yellow-500">
                    Draft
                  </span>
                )}
                <time className="block text-[13px] text-[#555]">
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-[#888]">
                  {post.excerpt}
                </p>
                <div className="mt-4 text-[14px] text-blue-400 group-hover:text-blue-300 transition-colors">
                  Read more →
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      </main>
    </div>
  );
}
