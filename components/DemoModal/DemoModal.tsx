"use client";

import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { whatsappUrl } from "@/lib/content";
import styles from "./DemoModal.module.css";

export default function DemoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    restaurantName: "",
    email: "",
  });

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === "#demo") {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    // Check on initial load
    handleHashChange();

    // Listen to hash changes natively
    window.addEventListener("hashchange", handleHashChange);

    // Intercept clicks on any link pointing to #demo
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.getAttribute("href")?.endsWith("#demo")) {
        e.preventDefault();
        setIsOpen(true);
        window.history.pushState(null, "", "#demo");
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  const closeModal = () => {
    setIsOpen(false);
    window.history.pushState(null, "", window.location.pathname + window.location.search);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("https://api.restrokhata.com/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          planCode: "DEMO_REQUEST",
          message: "Book a Demo Request",
        }),
      });
      window.open(whatsappUrl, "_blank");
      closeModal();
    } catch {
      window.open(whatsappUrl, "_blank");
      closeModal();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={closeModal} aria-label="Close modal">
          <X size={24} />
        </button>
        <h2 className={styles.title}>Book a Live Demo</h2>
        <p className={styles.subtitle}>
          20-minute walkthrough with our team. We show exactly how RestroKhata works for your type of outlet.
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input required type="text" name="name" placeholder="Your Name" className={styles.input} value={formData.name} onChange={handleChange} />
          <input required type="text" name="restaurantName" placeholder="Restaurant Name" className={styles.input} value={formData.restaurantName} onChange={handleChange} />
          <input required type="tel" name="phone" placeholder="Phone Number" className={styles.input} value={formData.phone} onChange={handleChange} minLength={7} />
          <input type="email" name="email" placeholder="Email Address (Optional)" className={styles.input} value={formData.email} onChange={handleChange} />
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Booking..." : "Book Free Demo"} <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}
