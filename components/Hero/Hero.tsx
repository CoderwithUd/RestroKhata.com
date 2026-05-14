import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./Hero.module.css";
import Link from "next/link";

export default function Hero() {
  return (
    <section className={styles.hero} id="hero" aria-labelledby="hero-title">
      <Reveal>
        <p className={styles.badge}>
          <span aria-hidden="true" />
          Free 3-month trial - no credit card required
        </p>
      </Reveal>
      <Reveal delay={1}>
        <h1 id="hero-title">
          Smart Restaurant POS Built for <span>Indian Cafes & Restaurants</span>
        </h1>
      </Reveal>
      <Reveal delay={2}>
        <p className={styles.subtitle}>
          QR ordering, live kitchen display, GST billing, table management, staff roles, and revenue reports in one fast cloud system.
        </p>
      </Reveal>
      <Reveal delay={3}>
        <div className={styles.actions}>
          <Link href="https://app.restrokhata.com/register" className="btn-hero-primary">
            Get Started Free <ArrowRight size={18} />
          </Link>
          <Link href="#demo" className="btn-hero-ghost">
            Request a Live Demo
          </Link>
        </div>
      </Reveal>
      <Reveal delay={4}>
        <ul className={styles.notes} aria-label="Trial benefits">
          <li>No setup fee</li>
          <li>No app download for customers</li>
          <li>WhatsApp onboarding support</li>
        </ul>
      </Reveal>
      <Reveal delay={5}>
        <div className={styles.stats} aria-label="RestroKhata highlights">
          {[
            ["10", "Min avg setup time"],
            ["3", "Months free trial"],
            ["100%", "Cloud-based"],
            ["₹0", "To start today"]
          ].map(([value, label]) => (
            <article className={styles.stat} key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </Reveal>
      <Reveal>
        <div className={styles.mockup} aria-label="Product dashboard preview">
          <article className="mockup-card">
            <div className="mockup-header">Live Orders</div>
            <div className="mockup-row"><span>Table 4 - Butter Chicken</span><span className="badge badge-placed">Placed</span></div>
            <div className="mockup-row"><span>Table 7 - Masala Chai x2</span><span className="badge badge-progress">In Progress</span></div>
            <div className="mockup-row"><span>Takeaway #12</span><span className="badge badge-ready">Ready</span></div>
            <div className="mockup-row"><span>Table 2 - Pizza</span><span className="badge badge-placed">Placed</span></div>
          </article>
          <article className="mockup-card">
            <div className="mockup-header">Today&apos;s Summary</div>
            <div className="mockup-row"><span>Total Orders</span><strong>47</strong></div>
            <div className="mockup-row"><span>Revenue</span><strong className={styles.orange}>₹18,420</strong></div>
            <div className="mockup-row"><span>GST Collected</span><strong>₹1,842</strong></div>
            <div className="mockup-row"><span>UPI Payments</span><strong>38</strong></div>
          </article>
          <article className="mockup-card">
            <div className="mockup-header">Table Status</div>
            <div className="table-grid">
              {["red", "green", "yellow", "red", "green", "red", "green", "yellow"].map((color, index) => (
                <span className={`table-chip chip-${color}`} key={`${color}-${index}`}>T{index + 1}</span>
              ))}
            </div>
          </article>
        </div>
      </Reveal>
    </section>
  );
}
