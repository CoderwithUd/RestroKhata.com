import Reveal from "@/components/Reveal/Reveal";
import styles from "./Transparency.module.css";

const ready = ["QR ordering from customer phones", "Kitchen Display System with live order queue", "KOT printing for thermal printers", "GST invoicing with UPI QR on bill", "Table management and reservations", "Staff roles for Owner, Manager, Waiter, Kitchen", "Cafe Mode and Restaurant Mode", "Takeaway tokens and walk-in billing", "Revenue reports and expense tracking", "Customer CRM visit tracking"];
const roadmap = ["Multi-outlet support", "Automated WhatsApp receipts and reminders", "Inventory and raw material tracking", "Loyalty points and rewards", "Smart analytics and AI-powered insights", "Swiggy and Zomato sync"];

export default function Transparency() {
  return (
    <section className={styles.section} aria-labelledby="transparency-title">
      <div className="container">
        <Reveal><p className="section-label">Honest About Where We Are</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="transparency-title">We Believe in Being Upfront</h2></Reveal>
        <Reveal delay={2}><p className="section-sub">Every restaurant owner who joins RestroKhata deserves full transparency about what is ready today and what is coming next.</p></Reveal>
        <div className={styles.grid}>
          <Reveal>
            <article className={styles.card}>
              <h3>What&apos;s Fully Ready Today</h3>
              <ul>{ready.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </Reveal>
          <Reveal delay={1}>
            <article className={`${styles.card} ${styles.coming}`}>
              <h3>Coming on the Roadmap</h3>
              <ul>{roadmap.map((item) => <li key={item}>{item}</li>)}</ul>
              <p>When multi-outlet launches, current subscribers get access automatically with no plan change.</p>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
