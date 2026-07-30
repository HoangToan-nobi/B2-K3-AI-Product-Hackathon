import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VLười — Gói Ôn Tập",
  description: "Lười đọc dài. Không lười hiểu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Literata:ital,opsz,wght@0,18..36,400;0,18..36,500;0,18..36,600;1,18..36,400;1,18..36,500&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
