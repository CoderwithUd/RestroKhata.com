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
          <div>
            <h3>What is RestroKhata?</h3>
            <p>
              RestroKhata is a smart, cloud-based restaurant POS (Point of Sale) software built for Indian cafes, dhabas, and cloud kitchens. It provides an all-in-one platform for QR code ordering, GST billing, kitchen display systems (KDS), and revenue reporting.
            </p>
            <p style={{ marginTop: "1rem" }}>
              Stop juggling handwritten KOTs, missed orders, manual bills, and scattered reports. RestroKhata brings every daily workflow into one simple system.
            </p>
          </div>
        </Reveal>
        <Reveal delay={2}>
          <div className={styles.statRow}>
            <article><span className={styles.statValue}>10 min</span><span>Average setup time</span></article>
            <article><span className={styles.statValue}>3 Mo.</span><span>Full-access free trial</span></article>
            <article><span className={styles.statValue}>100%</span><span>Cloud-based on any device</span></article>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
