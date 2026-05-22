import styles from "@/style/blog.module.css";

export default function Loading() {
  return (
    <main className={styles.blogIndex}>
      <section className={styles.indexHero}>
        <span className={styles.badge}>Loading</span>
        <h1>Loading article...</h1>
      </section>
    </main>
  );
}
