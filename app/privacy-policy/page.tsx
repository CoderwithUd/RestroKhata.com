import { Metadata } from "next";
import styles from "./privacy.module.css";
import Navigation from "@/components/Navigation/Navigation";
import Footer from "@/components/Footer/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | RestroKhata Restaurant & Cafe CRM",
  description:
    "Read RestroKhata's Privacy Policy to understand how we collect, use, store, and protect restaurant and cafe business data securely.",
  keywords: [
    "RestroKhata Privacy Policy",
    "Restaurant CRM privacy policy",
    "Cafe software privacy",
    "Restaurant billing software privacy",
    "Restaurant data protection",
    "Restaurant POS privacy policy",
  ],
  alternates: {
    canonical: "https://restrokhata.com/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy | RestroKhata",
    description:
      "Understand how RestroKhata protects restaurant and cafe business data.",
    url: "https://restrokhata.com/privacy-policy",
    siteName: "RestroKhata",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <>
    <Navigation />
    <main className={styles.privacy_page}>
      <div className={styles.privacy_container}>
        <div className={styles.privacy_header}>
          <h1>Privacy Policy</h1>
          <p>Effective: May 2026 • Version 1.0</p>
        </div>

        <div className={styles.privacy_layout}>
          {/* LEFT SIDEBAR */}

          <aside className={styles.privacy_sidebar}>
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
                href="#data-collection"
                className={styles.sidebar_link}
              >
                1. Data Collection
              </a>

              <a
                href="#data-purpose"
                className={styles.sidebar_link}
              >
                2. Data Usage
              </a>

              <a
                href="#data-sharing"
                className={styles.sidebar_link}
              >
                3. Data Sharing
              </a>

              <a
                href="#security"
                className={styles.sidebar_link}
              >
                4. Security
              </a>

              <a
                href="#rights"
                className={styles.sidebar_link}
              >
                5. Your Rights
              </a>

              <a
                href="#cookies"
                className={styles.sidebar_link}
              >
                6. Cookies
              </a>

              <a
                href="#whatsapp"
                className={styles.sidebar_link}
              >
                7. WhatsApp Communication
              </a>

              <a
                href="#contact"
                className={styles.sidebar_link}
              >
                8. Contact Us
              </a>
            </nav>
          </aside>

          {/* RIGHT CONTENT */}

          <div className={styles.privacy_content}>
            <section
              id="introduction"
              className={styles.privacy_section}
            >
              <h2>Introduction</h2>

              <p>
                RestroKhata aapki privacy ko seriously leta hai. Yeh Policy
                explain karti hai ki hum kaunsa data collect karte hain, kyun
                collect karte hain, kaise use karte hain, aur aapke kya rights
                hain.
              </p>
            </section>

            <section
              id="data-collection"
              className={styles.privacy_section}
            >
              <h2>1. Hum Kaunsa Data Collect Karte Hain</h2>

              <h3>1.1 Account Information</h3>

              <ul className={styles.privacy_list}>
                <li>Restaurant/outlet ka naam</li>
                <li>Owner ka naam</li>
                <li>WhatsApp number aur email address</li>
                <li>Restaurant address (city, state)</li>
                <li>FSSAI number (optional)</li>
                <li>GST number (optional)</li>
              </ul>

              <h3>1.2 Business Operations Data</h3>

              <ul className={styles.privacy_list}>
                <li>Menu items, categories, prices</li>
                <li>Orders placed through platform</li>
                <li>Table configurations</li>
                <li>Staff member names aur roles</li>
                <li>Customer names aur phone numbers</li>
                <li>Revenue aur sales reports</li>
                <li>Expenses logged by you</li>
              </ul>

              <h3>1.3 Technical Data</h3>

              <ul className={styles.privacy_list}>
                <li>IP address</li>
                <li>Browser type aur version</li>
                <li>Device type</li>
                <li>Pages visited aur time spent</li>
                <li>Login/logout timestamps</li>
                <li>Error logs</li>
              </ul>
            </section>

            <section
              id="data-purpose"
              className={styles.privacy_section}
            >
              <h2>2. Data Use karne ka Purpose</h2>

              <div className={styles.table_wrapper}>
                <table className={styles.privacy_table}>
                  <thead>
                    <tr>
                      <th>Data Type</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>Account Information</td>
                      <td>
                        Account create karna aur support provide karna
                      </td>
                    </tr>

                    <tr>
                      <td>Business Data</td>
                      <td>
                        Orders, billing aur reports functionality
                      </td>
                    </tr>

                    <tr>
                      <td>Technical Data</td>
                      <td>Security aur bug fixing</td>
                    </tr>

                    <tr>
                      <td>Payment Information</td>
                      <td>Subscription processing</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id="data-sharing"
              className={styles.privacy_section}
            >
              <h2>3. Data Sharing</h2>

              <div className={styles.highlight_box}>
                <strong>IMPORTANT:</strong> RestroKhata aapka data
                third-party advertisers ko nahi bechta.
              </div>

              <h3>Hum Data Share Karte Hain:</h3>

              <ul className={styles.privacy_list}>
                <li>Cloud infrastructure providers</li>
                <li>Payment processors</li>
                <li>Legal compliance authorities</li>
                <li>Business transfer situations</li>
              </ul>

              <h3>Hum Data Share NAHI Karte:</h3>

              <ul className={styles.privacy_list}>
                <li>Marketing agencies</li>
                <li>Competitors</li>
                <li>Data brokers</li>
              </ul>
            </section>

            <section
              id="security"
              className={styles.privacy_section}
            >
              <h2>4. Data Storage aur Security</h2>

              <ul className={styles.privacy_list}>
                <li>HTTPS encryption enabled</li>
                <li>
                  Passwords hashed format mein store hote hain
                </li>
                <li>Role-based access control</li>
                <li>Regular security reviews</li>
                <li>Access logs maintain kiye jaate hain</li>
              </ul>
            </section>

            <section
              id="rights"
              className={styles.privacy_section}
            >
              <h2>5. Your Rights</h2>

              <ul className={styles.privacy_list}>
                <li>Right to Access</li>
                <li>Right to Correction</li>
                <li>Right to Deletion</li>
                <li>Right to Export</li>
                <li>Right to Withdraw Consent</li>
              </ul>

              <p>
                Privacy requests ke liye email karein:
                <a
                  className={styles.privacy_link}
                  href="mailto:restrokhata@gmail.com"
                >
                  {" "}
                  restrokhata@gmail.com
                </a>
              </p>
            </section>

            <section
              id="cookies"
              className={styles.privacy_section}
            >
              <h2>6. Cookies aur Tracking</h2>

              <ul className={styles.privacy_list}>
                <li>Session Cookies</li>
                <li>Preference Cookies</li>
                <li>Analytics Cookies</li>
              </ul>
            </section>

            <section
              id="whatsapp"
              className={styles.privacy_section}
            >
              <h2>7. WhatsApp Communication</h2>

              <p>
                RestroKhata support aur onboarding ke liye WhatsApp
                use karta hai.
              </p>

              <ul className={styles.privacy_list}>
                <li>Business-related communication</li>
                <li>Support conversation history</li>
                <li>Optional promotional updates</li>
              </ul>
            </section>

            <section
              id="contact"
              className={styles.privacy_section}
            >
              <h2>8. Contact Us</h2>

              <div className={styles.contact_card}>
                <p>
                  <strong>Email:</strong>{" "}
                  <a
                    className={styles.privacy_link}
                    href="mailto:restrokhata@gmail.com"
                  >
                    restrokhata@gmail.com
                  </a>
                </p>

                <p>
                  <strong>WhatsApp:</strong>{" "}
                  <a
                    className={styles.privacy_link}
                    href="tel:+919131695767"
                  >
                    +91 9131695767
                  </a>
                </p>

                <p>
                  <strong>Website:</strong>{" "}
                  <a
                    className={styles.privacy_link}
                    href="https://restrokhata.com"
                    target="_blank"
                  >
                    restrokhata.com
                  </a>
                </p>

                <p>
                  <strong>Location:</strong> Raipur, Chhattisgarh,
                  India
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
