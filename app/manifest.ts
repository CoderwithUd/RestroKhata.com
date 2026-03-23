import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Restro Khata",
    short_name: "Restro Khata",
    description: "Production-ready auth flow for Restro Khata.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/Logo/RestroKhataCircleLogo.png",
        sizes: "1000x1000",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/Logo/RestroKhataCircleLogo.png",
        sizes: "1000x1000",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
