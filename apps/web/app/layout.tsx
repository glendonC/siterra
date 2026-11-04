import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SizeGate } from "../components/size-gate/SizeGate";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./daylight.css";
import "./obsidian.css";
import "./globals.css";

// The icons, the manifest and the link-preview image come from the files beside this layout (icon.svg,
// icon.png, apple-icon.png, manifest.ts, opengraph-image.png). The link preview's image needs an absolute
// URL: on a host it is built on the public origin (SITERRA_APP_ORIGIN); without it Next.js uses localhost.
const appOrigin = process.env["SITERRA_APP_ORIGIN"];

export const metadata: Metadata = {
  title: "Siterra",
  metadataBase: appOrigin !== undefined && URL.canParse(appOrigin) ? new URL(appOrigin) : null,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SizeGate />
        {children}
      </body>
    </html>
  );
}
