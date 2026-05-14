import Reveal from "@/components/Reveal/Reveal";
import styles from "./Testimonials.module.css";

const testimonials = [
  "RestroKhata changed how our cafe takes orders. No more paper slips to kitchen. Peak hours are smoother and we make fewer mistakes.",
  "Customers love the QR ordering. Table turnover improved and our waiter spends more time serving and less time writing.",
  "Setup in under an hour. GST billing works perfectly. The free trial alone was enough to prove this is the right platform."
];

export default function Testimonials() {
  return (
    <section className={styles.section} aria-labelledby="testimonials-title">
      <div className="container">
        <Reveal><p className="section-label">Early Adopters</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="testimonials-title">3 Cafes Are Already Live</h2></Reveal>
        <div className={styles.grid}>
          {testimonials.map((text, index) => (
            <Reveal delay={((index % 3) + 1) as 1 | 2 | 3} key={text}>
              <figure className={styles.card}>
                <div className={styles.avatar}>{index === 2 ? "R" : "C"}</div>
                <div className={styles.stars}>★★★★★</div>
                <blockquote>{text}</blockquote>
                <figcaption>{index === 2 ? "Restaurant Owner" : "Cafe Owner"}<span>{["Raipur", "Bhilai", "Durg"][index]}, Chhattisgarh</span></figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
