import { Metadata } from "next";
import styles from "./terms.module.css";
import Footer from "@/components/Footer/Footer";
import Navigation from "@/components/Navigation/Navigation";

export const metadata: Metadata = {
  title: "Terms of Service | RestroKhata Restaurant & Cafe CRM",
  description:
    "Read the Terms of Service for using RestroKhata Restaurant & Cafe CRM platform including subscriptions, billing, usage policies, and account terms.",
  keywords: [
    "RestroKhata Terms",
    "Restaurant CRM Terms of Service",
    "Cafe software terms",
    "Restaurant billing software terms",
    "Restaurant SaaS agreement",
  ],
  alternates: {
    canonical: "https://restrokhata.com/terms-of-service",
  },
  openGraph: {
    title: "Terms of Service | RestroKhata",
    description:
      "Understand the legal terms and conditions for using RestroKhata Restaurant CRM.",
    url: "https://restrokhata.com/terms-of-service",
    siteName: "RestroKhata",
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <>
    <Navigation />
    <main className={styles.terms_page}>
      <div className={styles.terms_container}>
        <div className={styles.terms_header}>
          <h1>Terms of Service</h1>

          <p>Effective: May 2026 • Version 1.0</p>
        </div>

        <div className={styles.terms_layout}>
          {/* LEFT SIDEBAR */}

          <aside className={styles.terms_sidebar}>
            <h3 className={styles.sidebar_title}>
              Contents
            </h3>

            <nav className={styles.sidebar_nav}>
              <a
                href="#introduction"
                className={styles.sidebar_link}
              >
                Introduction
              </a>

              <a
                href="#definitions"
                className={styles.sidebar_link}
              >
                1. Definitions
              </a>

              <a
                href="#service"
                className={styles.sidebar_link}
              >
                2. Service Description
              </a>

              <a
                href="#account"
                className={styles.sidebar_link}
              >
                3. Account Registration
              </a>

              <a
                href="#trial"
                className={styles.sidebar_link}
              >
                4. Free Trial
              </a>

              <a
                href="#payment"
                className={styles.sidebar_link}
              >
                5. Subscription & Payment
              </a>

              <a
                href="#acceptable-use"
                className={styles.sidebar_link}
              >
                6. Acceptable Use
              </a>

              <a
                href="#ownership"
                className={styles.sidebar_link}
              >
                7. Data Ownership
              </a>

              <a
                href="#availability"
                className={styles.sidebar_link}
              >
                8. Service Availability
              </a>

              <a
                href="#termination"
                className={styles.sidebar_link}
              >
                9. Termination
              </a>

              <a
                href="#liability"
                className={styles.sidebar_link}
              >
                10. Liability
              </a>

              <a
                href="#intellectual-property"
                className={styles.sidebar_link}
              >
                11. Intellectual Property
              </a>

              <a
                href="#law"
                className={styles.sidebar_link}
              >
                12. Governing Law
              </a>

              <a
                href="#changes"
                className={styles.sidebar_link}
              >
                13. Changes to Terms
              </a>

              <a
                href="#contact"
                className={styles.sidebar_link}
              >
                14. Contact Us
              </a>
            </nav>
          </aside>

          {/* RIGHT CONTENT */}

          <div className={styles.terms_content}>
            <section
              id="introduction"
              className={styles.terms_section}
            >
              <h2>Introduction</h2>

              <p>
                Yeh Terms of Service RestroKhata aur aapke beech ka
                legal agreement hai. Service use karke aap in Terms se
                agree karte hain.
              </p>
            </section>

            <section
              id="definitions"
              className={styles.terms_section}
            >
              <h2>1. Definitions</h2>

              <ul className={styles.terms_list}>
                <li>
                  <strong>Service:</strong> RestroKhata ka cloud-based
                  restaurant management software
                </li>

                <li>
                  <strong>User:</strong> Koi bhi vyakti ya business
                  jo platform use karta hai
                </li>

                <li>
                  <strong>Subscription:</strong> Monthly ya annual paid
                  plan
                </li>

                <li>
                  <strong>Outlet:</strong> Restaurant, cafe, dhaba ya
                  food service establishment
                </li>
              </ul>
            </section>

            <section
              id="service"
              className={styles.terms_section}
            >
              <h2>2. Service Description</h2>

              <ul className={styles.terms_list}>
                <li>QR Code self-ordering system</li>
                <li>Kitchen Display System (KDS)</li>
                <li>GST billing & invoicing</li>
                <li>Table management</li>
                <li>Staff role management</li>
                <li>Reports & analytics</li>
                <li>Customer CRM</li>
              </ul>
            </section>

            <section
              id="account"
              className={styles.terms_section}
            >
              <h2>3. Account Registration</h2>

              <h3>Eligibility</h3>

              <ul className={styles.terms_list}>
                <li>Minimum 18 years age required</li>
                <li>Valid email & phone number required</li>
                <li>Correct business information mandatory</li>
              </ul>

              <h3>Account Security</h3>

              <p>
                Aap apne account credentials ki security ke liye khud
                zimmedar hain.
              </p>
            </section>

            <section
              id="trial"
              className={styles.terms_section}
            >
              <h2>4. Free Trial</h2>

              <div className={styles.highlight_box}>
                3-month FREE trial with no credit card required.
              </div>

              <ul className={styles.terms_list}>
                <li>Maximum 3 staff members allowed</li>
                <li>Full platform access available</li>
                <li>One business = one free trial</li>
              </ul>
            </section>

            <section
              id="payment"
              className={styles.terms_section}
            >
              <h2>5. Subscription & Payment</h2>

              <div className={styles.table_wrapper}>
                <table className={styles.terms_table}>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Price</th>
                      <th>Features</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>Starter</td>
                      <td>Rs. 0 / 3 months</td>
                      <td>QR ordering, GST billing</td>
                    </tr>

                    <tr>
                      <td>Growth</td>
                      <td>Rs. 999 / month</td>
                      <td>Unlimited staff, CRM</td>
                    </tr>

                    <tr>
                      <td>Annual</td>
                      <td>Rs. 9,999 / year</td>
                      <td>Dedicated support</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id="acceptable-use"
              className={styles.terms_section}
            >
              <h2>6. Acceptable Use Policy</h2>

              <h3>Aap kya kar sakte hain</h3>

              <ul className={styles.terms_list}>
                <li>Restaurant business manage karna</li>
                <li>Orders & billing handle karna</li>
                <li>Staff access manage karna</li>
              </ul>

              <h3>Aap kya nahi kar sakte</h3>

              <ul className={styles.terms_list}>
                <li>Illegal activities</li>
                <li>Platform hacking</li>
                <li>Fake invoices generate karna</li>
                <li>Competitor scraping</li>
              </ul>
            </section>

            <section
              id="ownership"
              className={styles.terms_section}
            >
              <h2>7. Data & Content Ownership</h2>

              <p>
                Aapka restaurant data aapka hi rahega. RestroKhata
                ownership claim nahi karta.
              </p>
            </section>

            <section
              id="availability"
              className={styles.terms_section}
            >
              <h2>8. Service Availability</h2>

              <ul className={styles.terms_list}>
                <li>99% uptime target</li>
                <li>Scheduled maintenance notices</li>
                <li>Critical bugs fix priority</li>
              </ul>
            </section>

            <section
              id="termination"
              className={styles.terms_section}
            >
              <h2>9. Termination</h2>

              <p>
                Aap kabhi bhi account cancel kar sakte hain. Data 30
                days tak retain kiya jaata hai.
              </p>
            </section>

            <section
              id="liability"
              className={styles.terms_section}
            >
              <h2>10. Limitation of Liability</h2>

              <div className={styles.highlight_box}>
                RestroKhata indirect business losses ke liye liable
                nahi hai.
              </div>
            </section>

            <section
              id="intellectual-property"
              className={styles.terms_section}
            >
              <h2>11. Intellectual Property</h2>

              <p>
                RestroKhata brand, logo, software code aur UI design
                company ki intellectual property hai.
              </p>
            </section>

            <section
              id="law"
              className={styles.terms_section}
            >
              <h2>12. Governing Law</h2>

              <ul className={styles.terms_list}>
                <li>Indian laws applicable</li>
                <li>Jurisdiction: Raipur, Chhattisgarh</li>
                <li>Consumer court rights available</li>
              </ul>
            </section>

            <section
              id="changes"
              className={styles.terms_section}
            >
              <h2>13. Changes to Terms</h2>

              <p>
                Significant changes ke liye 30-day notice diya jaata
                hai via email ya WhatsApp.
              </p>
            </section>

            <section
              id="contact"
              className={styles.terms_section}
            >
              <h2>14. Contact Us</h2>

              <div className={styles.contact_card}>
                <p>
                  <strong>Email:</strong>{" "}
                  <a
                    className={styles.terms_link}
                    href="mailto:restrokhata@gmail.com"
                  >
                    restrokhata@gmail.com
                  </a>
                </p>

                <p>
                  <strong>WhatsApp:</strong>{" "}
                  <a
                    className={styles.terms_link}
                    href="tel:+919131695767"
                  >
                    +91 9131695767
                  </a>
                </p>

                <p>
                  <strong>Website:</strong>{" "}
                  <a
                    className={styles.terms_link}
                    href="https://restrokhata.com"
                    target="_blank"
                  >
                    restrokhata.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
    <Footer />
    </>
  );
}