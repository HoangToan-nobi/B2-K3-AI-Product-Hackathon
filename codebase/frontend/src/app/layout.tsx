import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VLười — Gói Ôn Tập AI",
  description: "Lười đọc dài. Không lười hiểu. Học thông minh với trợ lý AI theo ngữ cảnh bài giảng.",
  keywords: ["học tập", "AI tutor", "ôn tập", "VinUni", "slide"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
