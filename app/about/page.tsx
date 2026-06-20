import type { Metadata } from "next";
import { siteTitle } from "@/lib/seo";
import Navigation from "@/components/Navigation/Navigation";
import Footer from "@/components/Footer/Footer";
import styles from "./page.module.css";
import FinalCTA from "@/components/FinalCTA/FinalCTA";

export const metadata: Metadata = {
  title: `About Us | ${siteTitle}`,
  description: "Learn more about RestroKhata, our mission, vision, and how we empower restaurant owners with simpler, smarter operations.",
  alternates: {
    canonical: "/about"
  }
};

export default function AboutPage() {
  return (
    <>
      <Navigation />
      <main className={styles.container}>
        <h1 className={styles.title}>About RestroKhata</h1>

        <div className={styles.content}>
          <h2 className={styles.subtitle}>Empowering Restaurants with Simpler, Smarter Operations</h2>
          <p>
            RestroKhata is a restaurant management platform built to help restaurants, cafés, cloud kitchens, bakeries, and food businesses manage their operations with ease.
          </p>
          <p>
            Running a restaurant requires balancing countless responsibilities every day—from billing and order management to sales tracking, inventory monitoring, and customer service. Our mission is to simplify these processes through technology, allowing restaurant owners to focus on what truly matters: delivering great food and memorable customer experiences.
          </p>
          <p>
            We are building tools that are practical, affordable, and designed around the real needs of restaurant businesses.
          </p>

          <hr />

          <h2 className={styles.subtitle}>Our Story</h2>
          <p>RestroKhata started with a simple observation.</p>
          <p>
            Many restaurant owners work incredibly hard to build and grow their businesses, yet they often struggle with operational challenges that consume valuable time and resources. Billing records, order tracking, inventory management, and business reporting are frequently handled through multiple systems or manual processes.
          </p>
          <p>
            While exploring available solutions, we noticed a common problem: many platforms were either too expensive, overly complex, or designed primarily for large enterprises.
          </p>
          <p>We believed there was a better way.</p>
          <p>A solution that combines simplicity, reliability, and affordability without compromising on functionality.</p>
          <p>That belief became RestroKhata.</p>
          <p>
            From the very beginning, our goal has been to create software that restaurant owners can adopt quickly, use confidently, and depend on every day.
          </p>

          <hr />

          <h2 className={styles.subtitle}>Our Mission</h2>
          <p>To make restaurant management simple, efficient, and accessible for every food business.</p>
          <p>We strive to help restaurant owners:</p>
          <ul>
            <li>Save time on daily operations</li>
            <li>Improve billing and order management</li>
            <li>Make informed business decisions</li>
            <li>Reduce operational complexity</li>
            <li>Increase efficiency and profitability</li>
            <li>Embrace digital transformation with confidence</li>
          </ul>
          <p>
            Our mission is not just to provide software, but to support the growth and success of the businesses that use it.
          </p>

          <hr />

          <h2 className={styles.subtitle}>Our Vision</h2>
          <p>To become India&apos;s most trusted restaurant operating platform.</p>
          <p>
            We envision a future where every restaurant—whether a small café, a family-run restaurant, a cloud kitchen, or a growing multi-outlet brand—has access to powerful technology that helps them operate smarter and grow faster.
          </p>
          <p>
            We aim to create an ecosystem where restaurant owners can manage every aspect of their business from a single platform while leveraging automation, analytics, and intelligent insights to make better decisions.
          </p>
          <p>As the food industry evolves, RestroKhata will continue evolving alongside it.</p>

          <hr />

          <h2 className={styles.subtitle}>What We Stand For</h2>
          
          <h3>Simplicity</h3>
          <p>Technology should simplify work, not complicate it. Every feature we build is designed to be intuitive and easy to use.</p>
          
          <h3>Reliability</h3>
          <p>Restaurant operations cannot stop. We focus on building dependable solutions that businesses can trust every day.</p>
          
          <h3>Affordability</h3>
          <p>Modern business tools should be accessible to businesses of all sizes, not just large enterprises.</p>
          
          <h3>Customer Success</h3>
          <p>Our success is directly connected to the success of our customers. Every improvement we make is driven by real feedback and real business needs.</p>
          
          <h3>Continuous Innovation</h3>
          <p>We are committed to constantly improving our platform and delivering solutions that help restaurants stay ahead in a competitive market.</p>

          <hr />

          <h2 className={styles.subtitle}>What RestroKhata Helps You Manage</h2>
          <p>Our platform is designed to support key restaurant operations, including:</p>
          <ul>
            <li>Billing & Invoicing</li>
            <li>Order Management</li>
            <li>Sales Reporting</li>
            <li>Business Analytics</li>
            <li>Menu Management</li>
            <li>Multi-Outlet Operations</li>
            <li>Customer Data & Insights</li>
            <li>Staff Productivity Tracking</li>
            <li>Operational Performance Monitoring</li>
          </ul>
          <p>
            By bringing essential business functions together, RestroKhata helps restaurants reduce manual work and gain greater visibility into their operations.
          </p>

          <hr />

          <h2 className={styles.subtitle}>Building for the Future</h2>
          <p>The restaurant industry is changing rapidly, and technology is becoming an essential part of sustainable growth.</p>
          <p>At RestroKhata, we are continuously investing in the future of restaurant management through:</p>
          <ul>
            <li>Advanced Business Analytics</li>
            <li>Smart Inventory Management</li>
            <li>Automation Workflows</li>
            <li>AI-Powered Insights</li>
            <li>Performance Monitoring Tools</li>
            <li>Scalable Multi-Location Management</li>
          </ul>
          <p>
            Our goal is to help restaurants make faster decisions, operate more efficiently, and unlock new opportunities for growth.
          </p>

          <hr />

          <h2 className={styles.subtitle}>Our Commitment</h2>
          <p>
            Whether you are launching your first café, running a busy restaurant, managing a cloud kitchen, or expanding into multiple outlets, RestroKhata is committed to being your technology partner.
          </p>
          <p>We are building more than software.</p>
          <p>
            We are building a platform that helps restaurant businesses operate with confidence, grow sustainably, and succeed in a digital-first world.
          </p>

          <div className={styles.founder}>
            <h3>Founder</h3>
            <p><strong>Uday Dewangan</strong><br/>Founder, RestroKhata</p>
            <p className={styles.founderQuote}>
              &quot;RestroKhata was built with a simple belief: every restaurant deserves access to powerful, affordable, and easy-to-use technology that helps them focus on growth, not complexity.&quot;
            </p>
          </div>

          <p className={styles.brandEnd}>
            RestroKhata<br/>
            <span style={{color: "#555", fontSize: "1.1rem", fontWeight: "normal"}}>Built for Restaurants. Built for Growth. 🚀</span>
          </p>

        </div>
      </main>
      <FinalCTA />
      <Footer />
    </>
  );
}
