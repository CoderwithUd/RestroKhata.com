import { whatsappUrl } from "@/lib/content";
import styles from "./Footer.module.css";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  const shareUrl = encodeURIComponent("https://restrokhata.com/");
  const shareText = encodeURIComponent("RestroKhata restaurant POS with QR ordering, KDS, GST billing, and reports");

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <section className={styles.brand} aria-label="RestroKhata contact">
            <Link className={styles.logo} href="#hero">
              <Image src="/RestroKhata-RK-Complete-Icons/icon-circle-512x512.png" alt="RestroKhata logo" width={50} height={50} />
              RestroKhata
            </Link>
            <p>All-in-one restaurant management for Indian cafes, restaurants, and dhabas. QR ordering, live kitchen display, GST billing, and more.</p>
            <address>
              <Link href="mailto:restrokhata@gmail.com">restrokhata@gmail.com</Link>
              <Link href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp: +91 9131695767</Link>
              <span>Mon-Sat, 10 AM - 7 PM</span>
            </address>
          </section>
          <nav aria-label="Product links">
            <p className={styles.navTitle}>Product</p>
            <ul>
              <li><Link href="#feature-menu">QR Self-Ordering</Link></li>
              {/* priceing */}
              {/* <li><Link href="#pricing">Pricing</Link></li> */}
              {/* <li><Link href="#pricing">QR Stand Offer - ₹1,000</Link></li> */}
              <li><Link href="#modes">Cafe POS Mode</Link></li>
              <li><Link href="#modes">Restaurant KDS Mode</Link></li>
              <li><Link href="#feature-kds">Kitchen Display System</Link></li>
              <li><Link href="#feature-bill">GST Invoice Billing</Link></li>
            </ul>
          </nav>
          <nav aria-label="Company links">
            <p className={styles.navTitle}>Support & Company</p>
            <ul>
              <li><Link href="#demo">Book a Product Demo</Link></li>
              <li><Link href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp Support</Link></li>
              <li><Link href="#faq">Restaurant POS Questions</Link></li>
              <li><Link href="https://app.restrokhata.com/register">Create Free Account</Link></li>
              <li><Link href="/privacy-policy">Privacy Policy</Link></li>
              <li><Link href="/terms-and-condition">Terms and Condition</Link></li>
            </ul>
            <p>Proudly serving restaurants in Raipur, Bhilai, Durg, and beyond.</p>
          </nav>
        </div>
        <div className={styles.share} aria-label="Share RestroKhata">
          <span>Share</span>
          <Link href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer" aria-label="Share RestroKhata on Facebook">
            <Image src="/icons/facebook.png" alt="" width={22} height={22} />
          </Link>
          <Link href={`https://wa.me/?text=${shareText}%20${shareUrl}`} target="_blank" rel="noreferrer" aria-label="Share RestroKhata on WhatsApp">
            <Image src="/icons/whatsapp.png" alt="" width={22} height={22} />
          </Link>
          <Link href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noreferrer" aria-label="Share RestroKhata on X">
            <Image src="/icons/social.png" alt="" width={22} height={22} />
          </Link>
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
