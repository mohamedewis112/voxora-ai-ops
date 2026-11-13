"use client";

/**
 * Authentication screens (login / forgot password) — UI-ready for Supabase
 * Auth. Demo mode: any credentials sign in without a server.
 */

import { useState } from "react";
import { Languages, Loader2, Lock, LogIn, Mail, Moon, Sun } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AuthShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 45% at 50% 0%, color-mix(in oklch, var(--primary) 10%, transparent) 0%, transparent 70%), radial-gradient(35% 30% at 85% 90%, color-mix(in oklch, var(--chart-3) 8%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="absolute end-4 top-4 flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="gap-1.5 text-xs font-semibold">
          <Languages className="size-4" /> {t("app.lang")}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={t("common.theme")}>
          <Sun className="size-[18px] dark:hidden" />
          <Moon className="hidden size-[18px] dark:block" />
        </Button>
      </div>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <div className="mb-7 flex flex-col items-center gap-3 text-center">
      <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl shadow-lg shadow-primary/20">
        <Image src="/voxora.svg" alt="Voxora Sales" width={56} height={56} className="size-14" />
      </span>
      <div>
        <p className="text-lg font-bold tracking-tight">Voxora Sales</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("app.tagline")}</p>
      </div>
    </div>
  );
}

export function LoginView() {
  const { t } = useI18n();
  const login = useUiStore((s) => s.login);
  const setView = useUiStore((s) => s.setView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (process.env.NEXT_PUBLIC_DALEELY_ADAPTER === "supabase") {
        const res = await fetch("/api/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error(payload.error || "login_failed");
        login(payload.data);
      } else {
        login({ email });
      }
      setView("sales");
      toast.success(t("toast.loginSuccess"));
    } catch (error) {
      toast.error(error instanceof Error && error.message === "not_authorized_for_voxora" ? "هذا الحساب غير مصرح له بدخول Voxora" : "بيانات الدخول غير صحيحة");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <Brand />
      <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl shadow-black/10 backdrop-blur">
        <h1 className="text-lg font-semibold">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("auth.loginDesc")}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("common.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="ps-9" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("common.password")}</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="ps-9" required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            {t("auth.login")}
          </Button>
          {process.env.NEXT_PUBLIC_DALEELY_ADAPTER !== "supabase" && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => { login(); setView("sales"); }}>
              {t("auth.demoLogin")}
            </Button>
          )}
        </form>

      </div>
    </AuthShell>
  );
}

export function ForgotPasswordView() {
  const { t } = useI18n();
  const setView = useUiStore((s) => s.setView);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    toast.success(t("auth.resetSent"));
  };

  return (
    <AuthShell>
      <Brand />
      <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl shadow-black/10 backdrop-blur">
        <h1 className="text-lg font-semibold">{t("auth.forgotTitle")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("auth.forgotDesc")}</p>
        {sent ? (
          <div className="mt-5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
            {t("auth.resetSent")}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">{t("common.email")}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="reset-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="ps-9" required />
              </div>
            </div>
            <Button type="submit" className="w-full">{t("auth.sendReset")}</Button>
          </form>
        )}
        <button
          type="button"
          onClick={() => setView("login")}
          className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("auth.backToLogin")}
        </button>
      </div>
    </AuthShell>
  );
}
