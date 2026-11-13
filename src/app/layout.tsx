import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "Voxora AI — منصة المبيعات وعمليات العملاء",
  description:
    "منصة مبيعات وعمليات عملاء بالذكاء الاصطناعي: خط مبيعات، إدارة عملاء محتملين، ربط ملاك الأنشطة، دمج الأنشطة المكررة، واتساب، طابور AI Bot، وتدقيق كامل — بنية متعددة المستأجرين جاهزة للربط مع Asterisk ونماذج محلية.",
  keywords: ["AI", "sales", "CRM", "telephony", "WhatsApp", "leads", "Asterisk", "مبيعات", "عمليات"],
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
