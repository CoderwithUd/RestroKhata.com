import { blogs } from "@/data/blogs";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "@/style/blog.module.css";

export const metadata: Metadata = {
  title: "Blogs | RestroKhata",
  description: "Restaurant technology guides from RestroKhata.",
  alternates: {
    canonical: "https://restrokhata.com/blogs",
  },
  openGraph: {
    title: "Blogs | RestroKhata",
    description: "Restaurant technology guides from RestroKhata.",
    url: "https://restrokhata.com/blogs",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function BlogsPage() {
  return (
    <main className={styles.blogIndex}>
      <section className={styles.indexHero}>
        <span className={styles.badge}>RestroKhata Blogs</span>
        <h1>Restaurant Technology Guides</h1>
        <p>Practical articles on QR ordering, POS billing, GST invoices, and restaurant operations.</p>
      </section>

      <section className={styles.postGrid} aria-label="Blog posts">
        {blogs.map((blog) => (
          <article className={styles.postCard} key={blog.slug}>
            <Link href={`/blogs/${blog.slug}`} className={styles.postImageLink} aria-label={blog.title}>
              <Image
                src={blog.image}
                alt={`${blog.title} - RestroKhata blog cover image`}
                title={blog.title}
                width={640}
                height={360}
                className={styles.postImage}
              />
            </Link>
            <div className={styles.postCardBody}>
              <span className={styles.postCardCategory}>{blog.category || "Restaurant Tech"}</span>
              <time dateTime={blog.date}>
                {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(blog.date))}
              </time>
              <h2>
                <Link href={`/blogs/${blog.slug}`}>{blog.title}</Link>
              </h2>
              <p>{blog.description}</p>
              <Link href={`/blogs/${blog.slug}`} className={styles.readMore}>
                Read Article
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
