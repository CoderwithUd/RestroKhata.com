import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./Demo.module.css";
import Link from "next/link";

const cards = [
  {
    title: "Book a Live Demo",
    body: "20-minute walkthrough with our team. We show exactly how RestroKhata works for your type of outlet.",
    points: ["QR ordering from scan to kitchen display", "Live billing and UPI receipt generation", "Kitchen queue and staff roles", "Reports dashboard and daily summary"],
    cta: "Book Free Demo",
    href: "#demo",
    note: "Available Mon-Sat, 10 AM to 7 PM via WhatsApp or video call"
  },
  {
    title: "Start Free - No Demo Needed",
    body: "Sign up and explore the full platform yourself with real data. No demo required.",
    points: ["Full platform access during trial", "Test with real orders on Day 1", "WhatsApp support through setup", "3 months free with no commitment"],
    cta: "Start Free Trial",
    href: "https://app.restrokhata.com/register",
    note: "Takes less than 2 minutes to register"
  }
];

export default function Demo() {
  return (
    <section id="demo" className={styles.section} aria-labelledby="demo-title">
      <div className="container">
        <Reveal><p className="section-label">See It In Action</p></Reveal>
        <Reveal delay={1}><h2 className="section-title" id="demo-title">See RestroKhata Before You Commit</h2></Reveal>
        <div className={styles.grid}>
          {cards.map((card, index) => (
            <Reveal delay={(index + 1) as 1 | 2} key={card.title}>
              <article className={styles.card}>
                <p className={styles.cardTitle}>{card.title}</p>
                <p>{card.body}</p>
                <ul>{card.points.map((point) => <li key={point}>{point}</li>)}</ul>
                <Link href={card.href} target={card.href.startsWith("http") ? "_blank" : undefined} rel={card.href.startsWith("http") ? "noreferrer" : undefined}>
                  {card.cta} <ArrowRight size={17} />
                </Link>
                <small>{card.note}</small>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
