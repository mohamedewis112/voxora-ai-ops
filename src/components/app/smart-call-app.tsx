"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ensureDemoData } from "@/stores/data-store";
import { useUiStore, type ViewKey } from "@/stores/ui-store";
import { DesktopSidebar } from "./sidebar";
import { Footer, Header } from "./header";
import { LoginView } from "./auth/auth-views";
import { AccountView } from "./account-view";
import { SalesWorkspaceView } from "./ops/sales-workspace-view";
import { SalesFollowupsView } from "./ops/sales-followups-view";
import { PipelineView } from "./ops/pipeline-view";
import { UnclaimedView } from "./ops/unclaimed-view";
import { MergeReviewView } from "./ops/merge-review-view";
import { WhatsAppView } from "./ops/whatsapp-view";

const SALES_VIEWS: ViewKey[] = ["sales", "followups", "account"];
const ADMIN_VIEWS: ViewKey[] = [
  "sales", "pipeline", "unclaimed", "merge-review", "whatsapp",
  "account",
];

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <span className="animate-pulse">
        <Image src="/voxora.svg" alt="Voxora" width={56} height={56} priority className="size-14 rounded-2xl" />
      </span>
      <p className="text-sm font-medium text-muted-foreground">Voxora Sales</p>
    </div>
  );
}

export function SmartCallApp() {
  const { view, setView, authed, login, logout, account } = useUiStore();
  const [ready, setReady] = useState(false);
  const isSales = account.role === "sales_agent";
  const allowedViews = useMemo(() => isSales ? SALES_VIEWS : ADMIN_VIEWS, [isSales]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (process.env.NEXT_PUBLIC_DALEELY_ADAPTER === "supabase") {
        try {
          const res = await fetch("/api/auth/session", { cache: "no-store" });
          const payload = await res.json();
          if (!cancelled && res.ok && payload.ok) {
            login({ name: payload.data.name, email: payload.data.email, role: payload.data.role });
            if (payload.data.role === "sales_agent") setView("sales");
          } else if (!cancelled && !useUiStore.getState().authed) {
            logout();
          }
        } catch {
          if (!cancelled && !useUiStore.getState().authed) logout();
        }
      } else {
        ensureDemoData();
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !authed) return;
    const apply = () => {
      const h = window.location.hash.replace("#", "") as ViewKey;
      if (h && allowedViews.includes(h)) setView(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [ready, authed, allowedViews, setView]);

  useEffect(() => {
    if (ready && authed && !allowedViews.includes(view)) setView("sales");
  }, [ready, authed, view, allowedViews, setView]);

  useEffect(() => {
    if (ready && authed && typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${allowedViews.includes(view) ? view : "sales"}`);
    }
  }, [view, ready, authed, allowedViews]);

  if (!ready) return <Splash />;
  if (!authed) return <LoginView />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex w-full flex-1">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 md:px-6 md:py-6">
            <div key={view} className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              {renderView(view, isSales)}
            </div>
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}

function renderView(view: ViewKey, isSales: boolean) {
  if (view === "account") return <AccountView />;
  if (view === "followups") return isSales ? <SalesFollowupsView /> : <SalesWorkspaceView />;
  if (view === "whatsapp") return <WhatsAppView />;
  if (view === "sales") return <SalesWorkspaceView />;

  if (!isSales) {
    switch (view) {
      case "pipeline": return <PipelineView />;
      case "unclaimed": return <UnclaimedView />;
      case "merge-review": return <MergeReviewView />;
      default: return <SalesWorkspaceView />;
    }
  }
  return <SalesWorkspaceView />;
}
