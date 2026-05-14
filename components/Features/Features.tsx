import { features } from "@/lib/content";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./Features.module.css";

function FeatureVisual({ type }: { type: (typeof features)[number]["visual"] }) {
  if (type === "menu") {
    return (
      <>
        <div className="mockup-header">Customer QR Menu</div>
        {["Butter Chicken|Rich tomato gravy with naan|₹280", "Masala Chai|Freshly brewed, 200ml|₹40"].map((item) => {
          const [name, desc, price] = item.split("|");
          return <div className={styles.menuItem} key={name}><strong>{name}</strong><span>{desc}</span><div><b>{price}</b><button>+ Add</button></div></div>;
        })}
      </>
    );
  }
  if (type === "kds") {
    return (
      <>
        <div className="mockup-header">Kitchen Display</div>
        <div className={styles.kdsGrid}>
          <article><small>TABLE 4</small><strong>Butter Chicken</strong><span>Dal Makhani x2</span><b>PLACED</b></article>
          <article><small>TABLE 7</small><strong>Masala Chai x2</strong><span>Samosa x4</span><b>IN PROGRESS</b></article>
        </div>
      </>
    );
  }
  if (type === "bill") {
    return (
      <>
        <div className={styles.billHead}><strong>Cafe Aroma</strong><span>FSSAI: 123456789 | GST: 22XXXXX</span></div>
        <div className="mockup-row"><span>Butter Chicken</span><span>₹280</span></div>
        <div className="mockup-row"><span>Masala Chai x2</span><span>₹80</span></div>
        <div className="mockup-row"><span>GST @ 5%</span><span>₹18</span></div>
        <div className="mockup-row"><strong>TOTAL</strong><strong>₹378</strong></div>
        <div className={styles.qr}>UPI QR</div>
      </>
    );
  }
  if (type === "tables") {
    return (
      <>
        <div className="mockup-header">Floor Map</div>
        <div className={styles.floor}>{["T1|Rahul K.|red", "T2|Free|green", "T3|Reserved|yellow", "T4|Free|green", "T5|Priya M.|red", "T6|Party of 4|red"].map((item) => {
          const [table, name, color] = item.split("|");
          return <span className={styles[color]} key={table}><b>{table}</b><small>{name}</small></span>;
        })}</div>
      </>
    );
  }
  if (type === "roles") {
    return (
      <>
        <div className="mockup-header">Staff Roles</div>
        {["Owner|Full access", "Manager|Orders & reports", "Waiter|Orders & tables", "Kitchen|Queue & availability"].map((role) => {
          const [name, desc] = role.split("|");
          return <div className={styles.role} key={name}><strong>{name}</strong><span>{desc}</span></div>;
        })}
      </>
    );
  }
  return (
    <>
      <div className="mockup-header">Revenue Dashboard</div>
      <div className={styles.reportCards}><article><span>Today Revenue</span><strong>₹18,420</strong></article><article><span>Orders</span><strong>47</strong></article></div>
      <div className={styles.bars}>{[40, 65, 50, 80, 100].map((height) => <span style={{ height: `${height}%` }} key={height} />)}</div>
      <small className={styles.center}>Last 5 days</small>
    </>
  );
}

export default function Features() {
  return (
    <section id="features" className={styles.section} aria-labelledby="features-title">
      <div className="container">
        <Reveal><p className="section-label">Core Features</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="features-title">Everything Your Restaurant Needs - Nothing It Doesn&apos;t</h2></Reveal>
        <Reveal delay={2}><p className="section-sub">Built from real feedback from cafe and restaurant owners. Every feature earns its place.</p></Reveal>
        <div className={styles.list}>
          {features.map((feature, index) => (
            <article className={`${styles.block} ${index % 2 ? styles.reverse : ""}`} key={feature.title}>
              <Reveal className={styles.copy}>
                <p className={styles.num}>{feature.number} - {feature.eyebrow}</p>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <ul>{feature.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
              </Reveal>
              <Reveal className={styles.visual}>
                <div className={styles.visualInner}><FeatureVisual type={feature.visual} /></div>
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
