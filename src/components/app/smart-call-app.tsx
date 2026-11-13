"use client";

/**
 * Voxora AI — application root.
 * Single-route SPA shell: sidebar + header + view router (hash-synced),
 * auth gating and the sticky footer. Real routes are added later by the
 * backend phase if needed; the operational UI lives here.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { ensureDemoData } from "@/stores/data-store";
import { useUiStore, type ViewKey } from "@/stores/ui-store";
import { DesktopSidebar } from "./sidebar";
import { Footer, Header } from "./header";
import { LoginView, ForgotPasswordView } from "./auth/auth-views";
import { DashboardView } from "./dashboard/dashboard-view";
import { CallsView } from "./calls/calls-view";
import { QueueView } from "./calls/queue-view";
import { CampaignsView } from "./campaigns/campaigns-view";
import { AgentView } from "./agent/agent-view";
import { SettingsView } from "./settings/settings-view";
import { RecordingsView } from "./recordings/recordings-view";
import { AccountView } from "./account-view";
import { ContactsView } from "./contacts/contacts-view";
import { LeadsView } from "./leads/leads-view";
import { KnowledgeView } from "./knowledge/knowledge-view";
import { FollowUpsView } from "./followups/followups-view";
import { AnalyticsView } from "./analytics/analytics-view";
import { SalesWorkspaceView } from "./ops/sales-workspace-view";
import { PipelineView } from "./ops/pipeline-view";
import { UnclaimedView } from "./ops/unclaimed-view";
import { MergeReviewView } from "./ops/merge-review-view";
import { BotQueueView } from "./ops/bot-queue-view";
import { WhatsAppView } from "./ops/whatsapp-view";
import { PerformanceView } from "./ops/performance-view";
import { AuditView } from "./ops/audit-view";

const VALID_VIEWS: ViewKey[] = [
  "dashboard", "calls", "contacts", "campaigns", "leads", "agent", "knowledge",
  "followups", "analytics", "recordings", "settings", "account", "queue", "login", "forgot",
  "sales", "pipeline", "unclaimed", "merge-review", "bot-queue", "whatsapp", "performance", "audit",
];

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <span className="animate-pulse">
        <Image src="/voxora.svg" alt="Voxora AI" width={56} height={56} priority className="size-14 rounded-2xl" />
      </span>
      <p className="text-sm font-medium text-muted-foreground">Voxora AI</p>
    </div>
  );
}

export function SmartCallApp() {
  const { view, setView, authed, login, logout } = useUiStore();
  const [ready, setReady] = useState(false);

  // Hydrate local demo or validate the real Daleely Supabase session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (process.env.NEXT_PUBLIC_DALEELY_ADAPTER === "supabase") {
        try {
          const res = await fetch("/api/auth/session", { cache: "no-store" });
          const payload = await res.json();
          if (!cancelled && res.ok && payload.ok) login({ name: payload.data.name, role: payload.data.role });
          else if (!cancelled) logout();
        } catch { if (!cancelled) logout(); }
      } else {
        ensureDemoData();
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Hash deep-linking (e.g. #calls, #analytics).
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      if (h && VALID_VIEWS.includes(h as ViewKey)) setView(h as ViewKey);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    if (ready && typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${view}`);
    }
  }, [view, ready]);

  if (!ready) return <Splash />;

  if (!authed || view === "login") return <LoginView />;
  if (view === "forgot") return <ForgotPasswordView />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex w-full flex-1">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 md:px-6 md:py-6">
            <div key={view} className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
              {renderView(view)}
            </div>
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}

function renderView(view: ViewKey) {
  switch (view) {
    case "calls":
      return <CallsView />;
    case "queue":
      return <QueueView />;
    case "contacts":
      return <ContactsView />;
    case "campaigns":
      return <CampaignsView />;
    case "leads":
      return <LeadsView />;
    case "agent":
      return <AgentView />;
    case "knowledge":
      return <KnowledgeView />;
    case "followups":
      return <FollowUpsView />;
    case "analytics":
      return <AnalyticsView />;
    case "recordings":
      return <RecordingsView />;
    case "settings":
      return <SettingsView />;
    case "account":
      return <AccountView />;
    /* Voxora ops modules */
    case "sales":
      return <SalesWorkspaceView />;
    case "pipeline":
      return <PipelineView />;
    case "unclaimed":
      return <UnclaimedView />;
    case "merge-review":
      return <MergeReviewView />;
    case "bot-queue":
      return <BotQueueView />;
    case "whatsapp":
      return <WhatsAppView />;
    case "performance":
      return <PerformanceView />;
    case "audit":
      return <AuditView />;
    case "dashboard":
    default:
      return <DashboardView />;
  }
}
