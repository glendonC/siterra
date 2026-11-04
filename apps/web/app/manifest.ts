import type { MetadataRoute } from "next";
import { daylight } from "../lib/theme/daylight";

// The web app manifest (served at /manifest.webmanifest): the name, the brand icons beside this file, and
// the paper token as the ground and the theme colour.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Siterra",
    start_url: "/",
    background_color: daylight.paper,
    theme_color: daylight.paper,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon.png", sizes: "96x96", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
