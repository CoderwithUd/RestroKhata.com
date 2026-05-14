import Reveal from "@/components/Reveal/Reveal";
import styles from "./Tagline.module.css";

export default function Tagline() {
  return (
    <section className={styles.section} aria-labelledby="tagline-title">
      <div className="container">
        <Reveal>
          <h2 id="tagline-title">Your restaurant runs on chaos. RestroKhata fixes that.</h2>
        </Reveal>
        <Reveal delay={1}>
          <p>
            Stop juggling handwritten KOTs, missed orders, manual bills, and scattered reports. RestroKhata brings every daily workflow into one simple system.
          </p>
        </Reveal>
        <Reveal delay={2}>
          <div className={styles.statRow}>
            <article><strong>10 min</strong><span>Average setup time</span></article>
            <article><strong>3 Mo.</strong><span>Full-access free trial</span></article>
            <article><strong>100%</strong><span>Cloud-based on any device</span></article>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
