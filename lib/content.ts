export const whatsappUrl = "https://wa.me/9131695767";

export const steps = [
  {
    title: "Register Your Restaurant",
    body: "Sign up with your restaurant name, WhatsApp number, email, and address. Your account, 3-month free trial, and first outlet are created instantly.",
    time: "~2 minutes"
  },
  {
    title: "Choose Mode & Configure",
    body: "Pick Cafe Mode or Restaurant Mode. Set GST, invoice prefix, FSSAI number, UPI ID, logo, and receipt footer.",
    time: "~3 minutes"
  },
  {
    title: "Add Your Staff",
    body: "Register managers, waiters, and kitchen staff with role-based access so each person sees only what they need.",
    time: "~1 minute per staff"
  },
  {
    title: "Build Your Menu",
    body: "Create categories, add items with prices, variants, option groups, GST, preparation stations, and live availability.",
    time: "~10-20 minutes"
  },
  {
    title: "Set Up Tables & QR Codes",
    body: "Add tables, names, and seating capacity. Generate QR codes for each table, print them, and start accepting scan-to-order.",
    time: "~5 minutes"
  },
  {
    title: "Go Live",
    body: "Your team logs in, kitchen sees live orders, bills generate automatically, and your dashboard updates in real time.",
    time: "You are live"
  }
];

export const features = [
  {
    number: "01",
    eyebrow: "QR Code Self-Ordering",
    title: "Customers Order Themselves",
    body: "Place a QR code on every table. Customers scan, browse your digital menu, place their order, and request the bill from their own phone.",
    bullets: [
      "Contactless flow: scan, browse, order, track, bill request",
      "Real-time order status visible to the customer",
      "Supports dine-in, takeaway token, and walk-in direct billing",
      "Works in any smartphone browser with no app install"
    ],
    visual: "menu"
  },
  {
    number: "02",
    eyebrow: "Kitchen Display (KDS)",
    title: "No More Paper KOTs",
    body: "Every order hits the kitchen display the second it is placed. Separate queues for Kitchen, Bar, and Counter keep preparation moving.",
    bullets: [
      "Live order queue: Placed, In Progress, Ready, Served",
      "KOT print support for thermal printers",
      "Kitchen, Bar, and Counter tabs on one dashboard",
      "Takeaway token display for counter pickup orders"
    ],
    visual: "kds"
  },
  {
    number: "03",
    eyebrow: "GST Invoicing & UPI Billing",
    title: "Professional Billing in One Click",
    body: "Generate GST-compliant invoices instantly with logo, FSSAI number, UPI QR, tax breakdown, custom prefixes, footer, and terms.",
    bullets: [
      "Auto UPI QR on every printed bill",
      "GST inclusive or exclusive pricing with per-item tax lines",
      "Custom invoice prefix, header, footer, and T&C",
      "Print multiple copies or go fully digital"
    ],
    visual: "bill"
  },
  {
    number: "04",
    eyebrow: "Table Management & Reservations",
    title: "See Your Entire Floor at a Glance",
    body: "Know which tables are occupied, reserved, or free. Manage walk-ins and reservations side by side from one screen.",
    bullets: [
      "Table statuses: available, occupied, reserved",
      "Attach customer name and phone to any table",
      "Move items when guests switch tables",
      "Reservation flow with refund and no-show handling"
    ],
    visual: "tables"
  },
  {
    number: "05",
    eyebrow: "Role-Based Staff Access",
    title: "Right Access for Everyone",
    body: "Owner, manager, waiter, and kitchen roles each get focused access so staff can work quickly without exposing sensitive controls.",
    bullets: [
      "Owner controls settings, reports, billing, and staff",
      "Manager handles menu, orders, invoices, and expenses",
      "Waiter creates orders, requests bills, and views tables",
      "Kitchen sees live queue and updates item status"
    ],
    visual: "roles"
  },
  {
    number: "06",
    eyebrow: "Revenue Reports & Expense Tracking",
    title: "Know Your Numbers Daily",
    body: "Revenue, expenses, tax collection, and margins live in one dashboard with filters by date, payment type, and service mode.",
    bullets: [
      "Daily sales summary for orders, revenue, and tax",
      "Monthly trends for performance comparisons",
      "Expense logging by category",
      "Owner-only access keeps financials private"
    ],
    visual: "reports"
  }
] as const;

export const plans = [
  {
    name: "Starter",
    price: "FREE",
    description: "3 Months - Full Access",
    features: [
      "Complete platform with no feature locks",
      "Cafe Mode and Restaurant Mode",
      "Up to 3 staff members",
      "QR ordering for all tables",
      "GST invoices and UPI billing",
      "KOT print support",
      "WhatsApp support during setup"
    ],
    cta: "Start Free Trial"
  },
  {
    name: "Growth",
    price: "₹999",
    suffix: "/month",
    description: "After 3-month free trial",
    features: [
      "Everything in Starter",
      "Unlimited staff members",
      "Advanced KDS: Kitchen, Bar, and Counter",
      "Customer CRM with visit history",
      "Expense tracking and monthly P&L reports",
      "Group invoicing across tables",
      "Priority WhatsApp support"
    ],
    cta: "Get Growth Plan",
    popular: true
  },
  {
    name: "Annual",
    price: "₹9,999",
    suffix: "/year",
    description: "Save ₹1,989 vs monthly",
    features: [
      "Everything in Growth",
      "Save 2 months vs monthly billing",
      "Priority onboarding call",
      "Early access to new features",
      "Custom domain invoice branding",
      "Dedicated WhatsApp support line"
    ],
    cta: "Get Annual Plan"
  }
];

export const faqs = [
  {
    question: "Is RestroKhata only for restaurants, or does it work for cafes too?",
    answer:
      "Both. Cafe Mode handles instant counter service with no kitchen queue. Restaurant Mode runs the full kitchen workflow. You can switch anytime."
  },
  {
    question: "Do I need to buy any hardware?",
    answer:
      "No special hardware is required. Any Android or iOS phone or tablet works. For KOT printing, standard Bluetooth or USB thermal printers are compatible."
  },
  {
    question: "Is the 3-month free trial actually free?",
    answer:
      "Yes. No credit card or payment details are needed. Your account starts with a 3-month active subscription automatically."
  },
  {
    question: "Can I manage multiple outlets?",
    answer:
      "Not yet. Multi-outlet support is in development. Today, RestroKhata is fully operational for single-outlet restaurants and cafes."
  },
  {
    question: "Does RestroKhata generate GST-compliant invoices?",
    answer:
      "Yes. Invoices include GST breakdown, FSSAI or trade licence number, logo, UPI QR code, custom prefix, footer, terms, and customer details."
  },
  {
    question: "What is the QR Stand offer?",
    answer:
      "It includes a premium acrylic QR stand, 1 full year of RestroKhata, and setup assistance for ₹1,000 instead of the regular ₹2,500 launch value."
  },
  {
    question: "Can customers track their order status on their phone?",
    answer:
      "Yes. After placing an order through QR, customers can track the status from Placed to In Progress to Ready and request the bill."
  }
];
