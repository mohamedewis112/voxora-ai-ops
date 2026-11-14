"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, useI18n } from "@/lib/i18n";

function LocalizedToaster() {
  const { lang } = useI18n();
  return (
    <Toaster
      position={lang === "ar" ? "bottom-left" : "bottom-right"}
      richColors
      closeButton
      toastOptions={{ style: { fontFamily: "inherit" } }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <I18nProvider>
        {children}
        <LocalizedToaster />
      </I18nProvider>
    </ThemeProvider>
  );
}
