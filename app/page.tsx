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
import Pricing from "@/components/Pricing/Pricing";
import { siteDescription, siteTitle } from "@/lib/seo";
import Tagline from "@/components/Tagline/Tagline";
import Testimonials from "@/components/Testimonials/Testimonials";
import Transparency from "@/components/Transparency/Transparency";
import { faqs } from "@/lib/content";

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
  url: "https://restrokhata.com",
  logo: "https://restrokhata.com/RestroKhata-RK-Complete-Icons/icon-512x512.png",
  image: "https://restrokhata.com/RestroKhata-RK-Complete-Icons/og-image-1200x630.png",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: siteDescription,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    description: "1-month free trial"
  },
  areaServed: "IN"
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "RestroKhata",
  image: "https://restrokhata.com/RestroKhata-RK-Complete-Icons/og-image-1200x630.png",
  url: "https://restrokhata.com",
  telephone: "+919131695767",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Raipur",
    addressRegion: "Chhattisgarh",
    addressCountry: "IN"
  }
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(f => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.answer
    }
  }))
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([organizationSchema, localBusinessSchema, faqSchema]) }}
      />
      <Navigation />
      <main>
        <Hero />
        <Tagline />
        <HowItWorks />
        <Features />
        <Modes />
        <Pricing />
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
