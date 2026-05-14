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

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
            <Link href="https://app.restrokhata.com/register" className="btn-primary" target="_blank" rel="noreferrer">
              Start Free
            </Link>
          </div>
          <button className={styles.menuButton} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-menu">
            {open ? <X size={24} /> : <Menu size={24} />}
            <span className={styles.srOnly}>Toggle menu</span>
          </button>
        </nav>
      </header>
      <button
        className={`${styles.drawerBackdrop} ${open ? styles.drawerBackdropOpen : ""}`}
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setOpen(false)}
      />
      <aside id="mobile-menu" className={`${styles.mobileDrawer} ${open ? styles.mobileDrawerOpen : ""}`} aria-label="Mobile navigation">
        <div className={styles.drawerHeader}>
          <Link className={styles.logo} href="#hero" aria-label="RestroKhata home" onClick={() => setOpen(false)}>
            <Image src="/RestroKhata-RK-Complete-Icons/icon-circle-512x512.png" alt="logo" width={44} height={44} />
            <span>RestroKhata</span>
          </Link>
          <button className={styles.closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={22} />
          </button>
        </div>
        <nav className={styles.drawerLinks} aria-label="Mobile menu links">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={styles.drawerActions}>
          <Link href="#demo" className="btn-ghost" onClick={() => setOpen(false)}>
            Book Demo
          </Link>
          <Link href="https://app.restrokhata.com/register" className="btn-primary" onClick={() => setOpen(false)}>
            Start Free Trial
          </Link>
        </div>
      </aside>
    </>
  );
}
