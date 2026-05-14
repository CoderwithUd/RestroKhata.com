import { whatsappUrl } from "@/lib/content";
import styles from "./Footer.module.css";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <section className={styles.brand} aria-label="RestroKhata contact">
            <Link className={styles.logo} href="#hero">
              <Image src="/RestroKhata-RK-Complete-Icons/icon-circle-512x512.png" alt="logo" width={50} height={50} />
              RestroKhata
            </Link>
            <p>All-in-one restaurant management for Indian cafes, restaurants, and dhabas. QR ordering, live kitchen display, GST billing, and more.</p>
            <address>
              <Link href="mailto:hello@restrokhata.com">restrokhata@gmail.com</Link>
              <Link href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp: +91 9131695767</Link>
              <span>Mon-Sat, 10 AM - 7 PM</span>
            </address>
          </section>
          <nav aria-label="Product links">
            <h2>Product</h2>
            <ul>
              <li><Link href="#features">Features</Link></li>
              <li><Link href="#pricing">Pricing</Link></li>
              <li><Link href="#pricing">QR Stand Offer - ₹1,000</Link></li>
              <li><Link href="#modes">Cafe Mode</Link></li>
              <li><Link href="#modes">Restaurant Mode</Link></li>
              <li><Link href="#features">KDS & Kitchen Display</Link></li>
              <li><Link href="#features">GST Billing & Invoicing</Link></li>
            </ul>
          </nav>
          <nav aria-label="Company links">
            <h2>Support & Company</h2>
            <ul>
              <li><Link href="#demo">Contact Us</Link></li>
              <li><Link href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp Support</Link></li>
              <li><Link href="#faq">FAQ</Link></li>
              <li><Link href="#pricing">Free Trial</Link></li>
            </ul>
            <p>Proudly serving restaurants in Raipur, Bhilai, Durg, and beyond.</p>
          </nav>
        </div>
        <div className={styles.bottom}>
          <p>© 2026 RestroKhata. All rights reserved.</p>
          <p>Made in India for Indian restaurants</p>
          {/* <p><a href="#">Instagram</a><a href="#">LinkedIn</a></p> */}
        </div>
      </div>
    </footer>
  );
}
