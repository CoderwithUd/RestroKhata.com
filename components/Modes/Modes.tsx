import Reveal from "@/components/Reveal/Reveal";
import styles from "./Modes.module.css";

const modes = [
  {
    name: "Cafe Mode",
    title: "Speed First",
    description: "Perfect for coffee shops, juice bars, dessert counters, QSR, and bakeries where items are served instantly.",
    points: ["Items auto-marked Served on order", "Counter display for staff preparation", "Takeaway token generation", "Walk-in direct billing", "Fast flow for high footfall counters"],
    best: "Best for: Cafes, tea stalls, juice bars, bakeries"
  },
  {
    name: "Restaurant Mode",
    title: "Full Kitchen Flow",
    description: "Built for full-service restaurants where food flows from order to kitchen to table with status tracking at every step.",
    points: ["Placed to In Progress to Ready to Served", "Waiter-to-kitchen via live KDS", "Separate Kitchen, Bar, and Counter queues", "Item-level controls", "Group invoice across tables"],
    best: "Best for: Dhabas, family restaurants, cloud kitchens",
    featured: true
  }
];

export default function Modes() {
  return (
    <section className={styles.section} id="modes" aria-labelledby="modes-title">
      <div className="container">
        <Reveal><p className="section-label">Choose Your Mode</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="modes-title">Works for Cafes and Restaurants - Switch Anytime</h2></Reveal>
        <div className={styles.grid}>
          {modes.map((mode, index) => (
            <Reveal delay={(index + 1) as 1 | 2} key={mode.name}>
              <article className={`${styles.card} ${mode.featured ? styles.featured : ""}`}>
                <p className={styles.badge}>{mode.name}</p>
                <h3>{mode.title}</h3>
                <p>{mode.description}</p>
                <ul>{mode.points.map((point) => <li key={point}>{point}</li>)}</ul>
                <strong>{mode.best}</strong>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className={styles.note}>You can switch between Cafe Mode and Restaurant Mode anytime from Settings with no data loss and no re-setup.</p>
        </Reveal>
      </div>
    </section>
  );
}
