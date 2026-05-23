import { whatsappUrl } from "@/lib/content";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./FinalCTA.module.css";
import Image from "next/image";
import Link from "next/link";

export default function FinalCTA() {
  return (
    <section className={styles.section} aria-labelledby="final-cta-title">
      <div className="container">
        <Reveal><h2 id="final-cta-title">Ready to Modernize Your Restaurant?</h2></Reveal>
        <Reveal delay={1}><p>Join cafe and restaurant owners already running smarter with RestroKhata. Start your 1-month free trial today or grab the QR Stand launch offer.</p></Reveal>
        <Reveal delay={2}>
          <div className={styles.buttons}>
            <Link href="https://app.restrokhata.com/register" className={styles.whiteButton}>Start Free Trial - 3 Months Free</Link>
            <Link href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.outlineButton}>Get QR Stand + 1 Year - ₹1,000</Link>
          </div>
        </Reveal>
        <Reveal delay={3}>
          <Link href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.whatsapp}>
            <Image src="/icons/whatsapp.png" alt="WhatsApp chat" width={30} height={30} />
             WhatsApp Us - We Reply Fast
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
