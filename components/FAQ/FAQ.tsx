"use client";

import { useState } from "react";
import { faqs } from "@/lib/content";
import Reveal from "@/components/Reveal/Reveal";
import styles from "./FAQ.module.css";

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-title">
      <div className="container">
        <div className={styles.heading}>
          <Reveal><p className="section-label">FAQ</p></Reveal>
          <Reveal delay={1}><h2 className="section-title" id="faq-title">Questions? We Have Answers.</h2></Reveal>
        </div>
        <div className={styles.list}>
          {faqs.map((faq, index) => {
            const isOpen = index === openIndex;
            return (
              <article className={`${styles.item} ${isOpen ? styles.open : ""}`} key={faq.question}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpenIndex(isOpen ? -1 : index)}>
                  <span>{faq.question}</span>
                  <span className={styles.toggleIcon}>{isOpen ? "−" : "+"}</span>
                </button>
                <div className={styles.answer} hidden={!isOpen}>
                  <p>{faq.answer}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
