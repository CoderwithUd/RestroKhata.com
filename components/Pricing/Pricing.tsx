import { plans } from "@/lib/content";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./Pricing.module.css";

export default function Pricing() {
  return (
    <section id="pricing" className={styles.section} aria-labelledby="pricing-title">
      <div className="container">
        <Reveal><p className="section-label">Pricing</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="pricing-title">Simple Pricing Built for Indian Businesses</h2></Reveal>
        <Reveal delay={2}><p className="section-sub">Start free. Pay only when you are ready. No hidden charges. No credit card needed to start.</p></Reveal>
        <div className={styles.grid}>
          {plans.map((plan, index) => (
            <Reveal delay={((index % 3) + 1) as 1 | 2 | 3} key={plan.name}>
              <article className={`${styles.card} ${plan.popular ? styles.popular : ""}`}>
                {plan.popular ? <span className={styles.popularBadge}>Most Popular</span> : null}
                <h3 className={styles.planHeader}>
                  {plan.name}
                  {/* @ts-expect-error adding custom field */}
                  {plan.discountBadge && <span className={styles.discountBadge}>{plan.discountBadge}</span>}
                </h3>
                <p className={styles.price}>
                  {/* @ts-expect-error adding custom field */}
                  {plan.originalPrice && <del className={styles.originalPrice}>{plan.originalPrice}</del>}
                  {plan.price}<span>{plan.suffix}</span>
                </p>
                <p className={styles.desc}>{plan.description}</p>
                <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <a href="#demo" className={plan.popular ? styles.primaryButton : styles.ghostButton}>{plan.cta}</a>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <aside className={styles.offer} aria-label="Special launch offer">
            <div>
              <p className={styles.offerKicker}>Special Launch Offer</p>
              <h3>QR Stand + 1 Year Subscription</h3>
              <p>Premium acrylic QR stand, 1 full year of RestroKhata, and complete setup assistance. Your digital menu goes live ready to take orders.</p>
              <div className={styles.offerPrice}><del>₹2,500</del><strong>₹1,000</strong><span>all-inclusive</span></div>
              <small>Physical QR stand delivered, 1 year activated, setup done on WhatsApp</small>
            </div>
            <a href="https://app.restrokhata.com/register" className={styles.offerButton}>Order QR Stand - ₹1,000</a>
          </aside>
        </Reveal>
      </div>
    </section>
  );
}
