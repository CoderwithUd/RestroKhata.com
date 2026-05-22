import Link from "next/link";
import styles from "@/style/blog.module.css";

export default function BlogNotFound() {
  return (
    <main className={styles.blogIndex}>
      <section className={styles.indexHero}>
        <span className={styles.badge}>Not Found</span>
        <h1>Blog post not found</h1>
        <p>The article you are looking for is not available.</p>
        <Link href="/blogs" className={styles.readMore}>
          View all blogs
        </Link>
      </section>
    </main>
  );
}
