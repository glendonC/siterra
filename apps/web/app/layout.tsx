import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "./daylight.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siterra",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
