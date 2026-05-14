"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { whatsappUrl } from "@/lib/content";
import styles from "./Navigation.module.css";
import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#features", label: "Features" },
  { href: "#modes", label: "Modes" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" }
];

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <Link className={styles.whatsappFloat} href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp support">
        <Image src="/icons/whatsapp.png" alt="WhatsApp" width={50} height={50} />
      </Link>
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link className={styles.logo} href="#hero" aria-label="RestroKhata home">
            <Image src="/RestroKhata-RK-Complete-Icons/icon-circle-512x512.png" alt="logo" width={50} height={50} />
            <span>RestroKhata</span>
          </Link>
          <ul className={styles.links}>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Link href="#demo" className="btn-ghost">
              Book Demo
            </Link>
            <Link href="#pricing" className="btn-primary">
              Start Free
            </Link>
          </div>
          <button className={styles.menuButton} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-menu">
            {open ? <X size={24} /> : <Menu size={24} />}
            <span className={styles.srOnly}>Toggle menu</span>
          </button>
        </nav>
        <div id="mobile-menu" className={`${styles.mobileMenu} ${open ? styles.mobileMenuOpen : ""}`}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          <Link href="#demo" onClick={() => setOpen(false)}>
            Book Demo
          </Link>
          <Link href="#pricing" onClick={() => setOpen(false)}>
            Start Free Trial
          </Link>
        </div>
      </header>
    </>
  );
}
