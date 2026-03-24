import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const iconsBasePath = "/RestroKhata-RK-Complete-Icons";

  return {
    name: "Restro Khata",
    short_name: "Restro Khata",
    description: "Restaurant Accounting Software",
    start_url: "/",
    display: "standalone",
    background_color: "#FF6B00",
    theme_color: "#FF6B00",
    icons: [
      {
        src: `${iconsBasePath}/icon-72x72.png`,
        sizes: "72x72",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-96x96.png`,
        sizes: "96x96",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-128x128.png`,
        sizes: "128x128",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-144x144.png`,
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-152x152.png`,
        sizes: "152x152",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-192x192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-192x192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${iconsBasePath}/icon-384x384.png`,
        sizes: "384x384",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-512x512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconsBasePath}/icon-512x512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
