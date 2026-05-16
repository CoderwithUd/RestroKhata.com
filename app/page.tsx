import Demo from "@/components/Demo/Demo";
import FAQ from "@/components/FAQ/FAQ";
import Features from "@/components/Features/Features";
import FinalCTA from "@/components/FinalCTA/FinalCTA";
import Footer from "@/components/Footer/Footer";
import Hero from "@/components/Hero/Hero";
import HowItWorks from "@/components/HowItWorks/HowItWorks";
import type { Metadata } from "next";
import Modes from "@/components/Modes/Modes";
import Navigation from "@/components/Navigation/Navigation";
import { siteDescription, siteTitle } from "@/lib/seo";
import Tagline from "@/components/Tagline/Tagline";
import Testimonials from "@/components/Testimonials/Testimonials";
import Transparency from "@/components/Transparency/Transparency";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  alternates: {
    canonical: "/"
  }
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RestroKhata",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Cloud restaurant management software for Indian cafes, restaurants, and dhabas with QR ordering, KDS, GST billing, table management, staff roles, and reports.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    description: "3-month free trial"
  },
  areaServed: "IN"
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <Navigation />
      <main>
        <Hero />
        <Tagline />
        <HowItWorks />
        <Features />
        <Modes />
        {/* <Pricing /> */}
        <Transparency />
        <Demo />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
