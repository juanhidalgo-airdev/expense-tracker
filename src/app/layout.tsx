import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Submit expenses, get them approved.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      {/* The inline script below mutates <html> before React hydrates, which
          React would otherwise report as a mismatch. */}
      <html lang="en" suppressHydrationWarning>
        <head>
          {/*
            Runs before first paint, so the page never renders in one theme and
            then snaps to the other. A saved choice wins; otherwise fall back to
            the system preference. Deliberately inline and blocking — deferring
            it is exactly what causes the flash.
          */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`,
            }}
          />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
