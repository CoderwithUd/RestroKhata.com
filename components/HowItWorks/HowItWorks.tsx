import { steps } from "@/lib/content";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./HowItWorks.module.css";

export default function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title">
      <div className="container">
        <Reveal><p className="section-label">How It Works</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="how-title">Live in 6 Simple Steps</h2></Reveal>
        <Reveal delay={2}><p className="section-sub">No IT team. No complicated setup. Just sign up and start taking orders.</p></Reveal>
        <ol className={styles.grid}>
          {steps.map((step, index) => (
            <li className={styles.card} key={step.title}>
              <Reveal delay={((index % 3) + 1) as 1 | 2 | 3}>
                <span className={styles.number}>{index + 1}</span>
                <p className={styles.cardTitle}>{step.title}</p>
                <p>{step.body}</p>
                <small>{step.time}</small>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
