import Reveal from "@/components/Reveal/Reveal";
import styles from "./Testimonials.module.css";

const testimonials = [
  { text: "RestroKhata changed how our cafe takes orders. No more paper slips to kitchen. Peak hours are smoother and we make fewer mistakes.", name: "Rahul S.", role: "Cafe Owner", city: "Raipur" },
  { text: "Customers love the QR ordering. Table turnover improved and our waiter spends more time serving and less time writing.", name: "Anjali M.", role: "Cafe Owner", city: "Bhilai" },
  { text: "Setup in under an hour. GST billing works perfectly. The free trial alone was enough to prove this is the right platform.", name: "Vikram P.", role: "Restaurant Owner", city: "Durg" }
];

export default function Testimonials() {
  const reviewsSchema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "RestroKhata",
    "review": testimonials.map(t => ({
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5"
      },
      "author": {
        "@type": "Person",
        "name": t.name
      },
      "reviewBody": t.text
    }))
  };

  return (
    <section className={styles.section} aria-labelledby="testimonials-title">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewsSchema) }}
      />
      <div className="container">
        <Reveal><p className="section-label">Early Adopters</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="testimonials-title">3 Cafes Are Already Live</h2></Reveal>
        <div className={styles.grid}>
          {testimonials.map((t, index) => (
            <Reveal delay={((index % 3) + 1) as 1 | 2 | 3} key={t.name}>
              <figure className={styles.card}>
                <div className={styles.avatar}>{t.name.charAt(0)}</div>
                <div className={styles.stars}>★★★★★</div>
                <blockquote>{t.text}</blockquote>
                <figcaption>{t.name} - {t.role}<span>{t.city}, Chhattisgarh</span></figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
