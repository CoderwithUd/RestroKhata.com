// app/contact/page.tsx

import { Metadata } from "next";
import styles from "./contact.module.css";
import Navigation from "@/components/Navigation/Navigation";
import Footer from "@/components/Footer/Footer";

export const metadata: Metadata = {
  title: "Contact Us | RestroKhata Restaurant & Cafe CRM",
  description:
    "Get in touch with RestroKhata for restaurant CRM demos, support, onboarding, billing help, and business inquiries.",
  keywords: [
    "RestroKhata Contact",
    "Restaurant CRM Support",
    "Cafe Software Contact",
    "Restaurant Billing Support",
    "Restaurant CRM Demo",
  ],
  alternates: {
    canonical: "https://restrokhata.com/contact",
  },
  openGraph: {
    title: "Contact RestroKhata",
    description:
      "Contact RestroKhata for demos, onboarding, support, and restaurant software assistance.",
    url: "https://restrokhata.com/contact",
    siteName: "RestroKhata",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <>
      <Navigation />
      <main className={styles.contact_page}>
        <div className={styles.contact_container}>
          {/* HERO */}

          <section className={styles.hero_section}>
            {/* <span className={styles.badge}>
            Restaurant & Cafe CRM
          </span> */}

            <h1>
              Let’s Grow Your Restaurant
              <span> Smarter</span>
            </h1>

            <p>
              Contact RestroKhata for product demos, onboarding, billing
              support, integrations, or any restaurant management assistance.
            </p>
          </section>

          {/* MAIN SECTION */}

          <div className={styles.contact_layout}>
            {/* LEFT SIDE */}

            <div className={styles.contact_info}>
              <div className={styles.info_card}>
                <div className={styles.icon}>📧</div>
                <div className={styles.info_card_top}>
                  <strong>Email Support</strong>
                  <a href="mailto:restrokhata@gmail.com">
                    restrokhata@gmail.com
                  </a>
                  <span>
                    Business inquiries, onboarding & technical support.
                  </span>
                </div>
              </div>

              <div className={styles.info_card}>
                <div className={styles.icon}>📱</div>
                <div className={styles.info_card_top}>
                  <strong>WhatsApp</strong>
                  <a href="https://wa.me/919131695767" target="_blank">
                    +91 9131695767
                  </a>
                  <span>
                    Quick response for demos and restaurant setup assistance.
                  </span>
                </div>
              </div>

              <div className={styles.info_card}>
                <div className={styles.icon}>📍</div>
                <div className={styles.info_card_top}>
                  <strong>Location</strong>
                  <a href="/contact">Raipur, Chhattisgarh, India</a>
                  <span>Supporting restaurants across India.</span>
                </div>
              </div>

              <div className={styles.support_card}>
                <h3>Need a Free Demo?</h3>

                <p>
                  See QR ordering, KDS, billing, inventory, analytics and staff
                  management in action.
                </p>

                <a
                  href="https://wa.me/919131695767?text=Hi%20I%20want%20a%20demo%20for%20RestroKhata"
                  target="_blank"
                  className={styles.demo_button}
                >
                  Book Free Demo
                </a>
              </div>
            </div>

            {/* RIGHT SIDE */}

            <div className={styles.form_wrapper}>
              <div className={styles.form_card}>
                <h2>Send Us a Message</h2>

                <p>
                  Fill out the form and our team will get back to you shortly.
                </p>

                <form className={styles.contact_form}>
                  <div className={styles.form_grid}>
                    <div className={styles.input_group}>
                      <label>Full Name</label>

                      <input type="text" placeholder="Enter your name" />
                    </div>

                    <div className={styles.input_group}>
                      <label>Restaurant Name</label>

                      <input
                        type="text"
                        placeholder="Restaurant or cafe name"
                      />
                    </div>
                  </div>

                  <div className={styles.form_grid}>
                    <div className={styles.input_group}>
                      <label>Email Address</label>

                      <input type="email" placeholder="Enter your email" />
                    </div>

                    <div className={styles.input_group}>
                      <label>Phone Number</label>

                      <input type="tel" placeholder="+91 XXXXX XXXXX" />
                    </div>
                  </div>

                  <div className={styles.input_group}>
                    <label>Business Type</label>

                    <select>
                      <option>Restaurant</option>
                      <option>Cafe</option>
                      <option>Cloud Kitchen</option>
                      <option>Food Court</option>
                      <option>Dhaba</option>
                    </select>
                  </div>

                  <div className={styles.input_group}>
                    <label>Your Message</label>

                    <textarea
                      rows={6}
                      placeholder="Tell us about your restaurant or requirements..."
                    />
                  </div>

                  <button type="submit" className={styles.submit_button}>
                    Send Message
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
