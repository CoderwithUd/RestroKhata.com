export type Blog = {
  slug: string;
  title: string;
  description: string;
  image: string;
  date: string;
  updatedAt: string;
  readingTime: string;
  category: string;
  component: string;
  keywords: string[];
};

export const blogs: Blog[] = [
  {
    slug: "qr-menu-system-restaurants-india",
    title: "QR Menu System for Restaurants in India 2026",
    description:
      "Digital ordering software with POS billing and GST invoices.",
    image: "/RestroKhata-RK-Complete-Icons/og-image-1200x630.png",
    date: "2026-05-22",
    updatedAt: "2026-06-01",
    readingTime: "8 minutes",
    category: "Restaurant Technology",
    component: "blog1",
    keywords: [
      "QR menu system for restaurants",
      "digital menu QR code",
      "restaurant QR ordering software India",
      "QR code menu app",
      "online menu for restaurant",
      "restaurant billing software India",
      "restaurant POS software",
      "table ordering system",
      "contactless menu app",
      "restaurant management software",
      "best QR menu system for small restaurants India",
      "free QR menu app for cafe",
      "restaurant digital menu software with billing",
      "how to create QR menu for restaurant",
    ],
  },
];
