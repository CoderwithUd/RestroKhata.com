import { features } from "@/lib/content";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./Features.module.css";
import Image from "next/image";

function FeatureVisual({
  type,
}: {
  type: (typeof features)[number]["visual"];
}) {
  if (type === "menu") {
    return (
      <>
        {/* <div className="mockup-header">Customer QR Menu</div>
        {["Butter Chicken|Rich tomato gravy with naan|₹280", "Masala Chai|Freshly brewed, 200ml|₹40"].map((item) => {
          const [name, desc, price] = item.split("|");
          return <div className={styles.menuItem} key={name}><span className={styles.itemName}>{name}</span><span>{desc}</span><div><span className={styles.price}>{price}</span><button>+ Add</button></div></div>;
        })} */}
        <div className={styles.imageWrap}>
          <Image
            src="/images/restaurant-self-ordering-feature.png"
            alt="Customers ordering food themselves using QR menu system in a restaurant"
            title="Restaurant Self Ordering System"
            width={820}
            height={547}
            loading="lazy"
            className={styles.featureImage}
          />
        </div>
      </>
    );
  }
  if (type === "kds") {
    return (
      <>
        <div className={styles.imageWrap}>
          <Image
            src="/images/restaurant-kitchen-display-system-kds.png"
            alt="Restaurant kitchen display system displaying live orders with KOT management, chef workflow tracking and real-time order synchronization."
            title="Kitchen Display System (KDS) & KOT Management for Restaurants"
            width={820}
            height={547}
            loading="lazy"
            className={styles.featureImage}
          />
        </div>
        {/* <div className="mockup-header">Kitchen Display</div>
        <div className={styles.kdsGrid}>
          <article>
            <small>TABLE 4</small>
            <span className={styles.itemName}>Butter Chicken</span>
            <span>Dal Makhani x2</span>
            <span className={styles.status}>PLACED</span>
          </article>
          <article>
            <small>TABLE 7</small>
            <span className={styles.itemName}>Masala Chai x2</span>
            <span>Samosa x4</span>
            <span className={styles.status}>IN PROGRESS</span>
          </article>
        </div> */}
      </>
    );
  }
  if (type === "bill") {
    return (
      <>
        {/* <div className={styles.billHead}><span className={styles.itemName}>Cafe Aroma</span><span>FSSAI: 123456789 | GST: 22XXXXX</span></div>
        <div className="mockup-row"><span>Butter Chicken</span><span>₹280</span></div>
        <div className="mockup-row"><span>Masala Chai x2</span><span>₹80</span></div>
        <div className="mockup-row"><span>GST @ 5%</span><span>₹18</span></div>
        <div className="mockup-row"><span className={styles.itemName}>TOTAL</span><span className={styles.itemName}>₹378</span></div>
        <div className={styles.qr}>UPI QR</div> */}
        <div className={styles.imageWrap}>
          <Image
            src="/images/gst-invoicing-upi-billing-system.png"
            alt="GST invoicing and UPI billing system for restaurants with QR code payments and digital invoices"
            title="GST Invoicing & UPI Billing Software for Restaurants"
            width={820}
            height={547}
            loading="lazy"
            className={styles.featureImage}
          />
        </div>
      </>
    );
  }
  if (type === "tables") {
    return (
      <>
        <div className={styles.imageWrap}>
          <Image
            src="/images/restaurant-table-management-reservation-system.png"
            alt="Restaurant table management and reservation system showing occupied and available tables"
            title="Restaurant Table Management & Reservation Software"
            width={820}
            height={547}
            loading="lazy"
            className={styles.featureImage}
          />
        </div>
        {/* <div className="mockup-header">Floor Map</div>
        <div className={styles.floor}>{["T1|Rahul K.|red", "T2|Free|green", "T3|Reserved|yellow", "T4|Free|green", "T5|Priya M.|red", "T6|Party of 4|red"].map((item) => {
          const [table, name, color] = item.split("|");
          return <span className={styles[color]} key={table}><span className={styles.itemName}>{table}</span><small>{name}</small></span>;
        })}</div> */}
      </>
    );
  }
  if (type === "roles") {
    return (
      <>
        {/* <div className="mockup-header">Staff Roles</div>
        {[
          "Owner|Full access",
          "Manager|Orders & reports",
          "Waiter|Orders & tables",
          "Kitchen|Queue & availability",
        ].map((role) => {
          const [name, desc] = role.split("|");
          return (
            <div className={styles.role} key={name}>
              <span className={styles.itemName}>{name}</span>
              <span>{desc}</span>
            </div>
          );
        })} */}
        <div className={styles.imageWrap}>
          <Image
            src="/images/restaurant-role-based-staff-management-system.png"
            alt="Restaurant staff management dashboard with owner, manager, waiter and kitchen role access"
            title="Role-Based Staff Access for Restaurant Management"
            width={820}
            height={547}
            loading="lazy"
            className={styles.featureImage}
          />
        </div>
      </>
    );
  }
  return (
    <>
      {/* <div className="mockup-header">Revenue Dashboard</div>
      <div className={styles.reportCards}>
        <article>
          <span>Today Revenue</span>
          <span className={styles.reportValue}>₹18,420</span>
        </article>
        <article>
          <span>Orders</span>
          <span className={styles.reportValue}>47</span>
        </article>
      </div>
      <div className={styles.bars}>
        {[40, 65, 50, 80, 100].map((height) => (
          <span style={{ height: `${height}%` }} key={height} />
        ))}
      </div>
      <small className={styles.center}>Last 5 days</small> */}
      <div className={styles.imageWrap}>
        <Image
          src="/images/restaurant-pos-management-system-dashboard.png"
          alt="Restaurant owner and manager using restaurant POS software dashboard for billing, order management, sales reports and QR menu ordering."
          title="Restaurant POS Management System | Billing, Orders & QR Menu Software"
          width={820}
          height={547}
          loading="lazy"
          className={styles.featureImage}
        />
      </div>
    </>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      className={styles.section}
      aria-labelledby="features-title"
    >
      <div className="container">
        <Reveal>
          <p className="section-label">Core Features</p>
        </Reveal>
        <Reveal delay={1}>
          <h2 className="section-title" id="features-title">
            Everything Your Restaurant Needs - Nothing It Doesn&apos;t
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p className="section-sub">
            Built from real feedback from cafe and restaurant owners. Every
            feature earns its place.
          </p>
        </Reveal>
        <div className={styles.list}>
          {features.map((feature, index) => (
            <article
              className={`${styles.block} ${index % 2 ? styles.reverse : ""}`}
              id={`feature-${feature.visual}`}
              key={feature.title}
            >
              <Reveal className={styles.copy}>
                <p className={styles.num}>
                  {feature.number} - {feature.eyebrow}
                </p>
                <p className={styles.featureTitle}>{feature.title}</p>
                <p>{feature.body}</p>
                <ul>
                  {feature.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal className={styles.visual}>
                <div className={styles.visualInner}>
                  <FeatureVisual type={feature.visual} />
                </div>
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
