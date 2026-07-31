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
      <body>{children}</body>
    </html>
  );
}
