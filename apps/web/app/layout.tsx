import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SizeGate } from "../components/size-gate/SizeGate";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./daylight.css";
import "./obsidian.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siterra",
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
