import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "Voxora Sales — إدارة المبيعات ومتابعة العملاء",
  description:
    "منصة تشغيل لفريق المبيعات: توزيع العملاء المحتملين، تسجيل نتائج التواصل، المتابعات، واتساب، وربط أصحاب الأنشطة ببياناتهم.",
  keywords: ["sales", "CRM", "WhatsApp", "leads", "مبيعات", "متابعة العملاء", "دليلي"],
  icons: { icon: "/voxora.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0d12",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
