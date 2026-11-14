"use client";

/**
 * Settings — generic, vendor-agnostic configuration for the future
 * self-hosted stack (Asterisk / local LLM / Whisper.cpp / local Arabic TTS /
 * Supabase). No paid provider is referenced anywhere. Every change is
 * persisted immediately; the Save button confirms with a toast.
 */

import { useState } from "react";
import {
  Bot,
  Database,
  Globe,
  HardDriveDownload,
  Mic,
  PhoneForwarded,
  PhoneCall,
  Plus,
  Save,
  ShieldCheck,
  Volume2,
  BellRing,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { uid } from "@/lib/types";
import type { AppSettings, TransferRule } from "@/lib/types";
import { PageHeader } from "@/components/app/shared/page-header";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SettingsView() {
  const { t } = useI18n();
  const settings = useDataStore((s) => s.settings);
  const store = useDataStore;
  const [resetOpen, setResetOpen] = useState(false);
  const s = settings;

  const saveToast = () => toast.success(t("settings.saved"));

  const TABS: Array<[string, string, LucideIcon]> = [
    ["general", "settings.tabGeneral", Globe],
    ["telephony", "settings.tabTelephony", PhoneCall],
    ["ai", "settings.tabAI", Bot],
    ["stt", "settings.tabSTT", Mic],
    ["tts", "settings.tabTTS", Volume2],
    ["database", "settings.tabDatabase", Database],
    ["transfer", "settings.tabTransfer", PhoneForwarded],
    ["security", "settings.tabSecurity", ShieldCheck],
    ["notifications", "settings.tabNotifications", BellRing],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("settings.title")}
        desc={t("settings.desc")}
        actions={
          <Button onClick={saveToast}>
            <Save className="size-4" />
            {t("common.saveChanges")}
          </Button>
        }
      />

      <Tabs defaultValue="general">
        <TabsList className="sc-scroll h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto sm:flex-wrap">
          {TABS.map(([key, labelKey, Icon]) => (
            <TabsTrigger key={key} value={key} className="gap-1.5 whitespace-nowrap rounded-lg px-3 data-[state=active]:bg-card">
              <Icon className="size-4" />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ------------------------------- general ------------------------------ */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <SectionCard title={t("settings.tabGeneral")} icon={<Globe className="size-4 text-primary" />}>
            <Field label={t("settings.appName")}>
              <Input value={s.general.appName} onChange={(e) => store.getState().updateSettings("general", { appName: e.target.value })} />
            </Field>
            <Field label={t("settings.timezone")}>
              <Select value={s.general.timezone} onValueChange={(v) => store.getState().updateSettings("general", { timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Cairo">Africa/Cairo (UTC+2)</SelectItem>
                  <SelectItem value="Asia/Riyadh">Asia/Riyadh (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </SectionCard>

          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <HardDriveDownload className="size-4" />
                {t("settings.dangerZone")}
              </CardTitle>
              <CardDescription>{t("settings.resetDemoDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setResetOpen(true)}>
                <Trash2 className="size-4" />
                {t("settings.resetDemo")}
              </Button>
            </CardContent>
          </Card>

          <ConfirmDialog
            open={resetOpen}
            onOpenChange={setResetOpen}
            title={t("settings.resetDemo")}
            desc={t("settings.resetDemoConfirm")}
            confirmLabel={t("common.confirm")}
            cancelLabel={t("common.cancel")}
            onConfirm={() => {
              store.getState().resetDemoData();
              toast.success(t("settings.resetDone"));
            }}
          />
        </TabsContent>

        {/* ------------------------------ telephony ----------------------------- */}
        <TabsContent value="telephony" className="mt-4">
          <SectionCard title={t("settings.tabTelephony")} icon={<PhoneCall className="size-4 text-primary" />} desc={t("settings.telephonyNote")}>
            <Field label={t("settings.provider")}>
              <Select
                value={s.telephony.provider}
                onValueChange={(v) => store.getState().updateSettings("telephony", { provider: v as "mock" | "asterisk" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock">{t("settings.providerMock")}</SelectItem>
                  <SelectItem value="asterisk">{t("settings.providerAsterisk")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("settings.backendUrl")}>
              <Input dir="ltr" placeholder="https://pbx.example.local" value={s.telephony.backendUrl} onChange={(e) => store.getState().updateSettings("telephony", { backendUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.wsUrl")}>
              <Input dir="ltr" value={s.telephony.wsUrl} onChange={(e) => store.getState().updateSettings("telephony", { wsUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.apiUrl")}>
              <Input dir="ltr" value={s.telephony.apiUrl} onChange={(e) => store.getState().updateSettings("telephony", { apiUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.apiSecret")}>
              <Input dir="ltr" type="password" value={s.telephony.apiSecret} onChange={(e) => store.getState().updateSettings("telephony", { apiSecret: e.target.value })} />
            </Field>
            <Field label={t("settings.statusEndpoint")}>
              <Input dir="ltr" value={s.telephony.statusEndpoint} onChange={(e) => store.getState().updateSettings("telephony", { statusEndpoint: e.target.value })} />
            </Field>
            <Field label={t("settings.callEndpoint")}>
              <Input dir="ltr" value={s.telephony.callEndpoint} onChange={(e) => store.getState().updateSettings("telephony", { callEndpoint: e.target.value })} />
            </Field>
            <Field label={t("settings.hangupEndpoint")}>
              <Input dir="ltr" value={s.telephony.hangupEndpoint} onChange={(e) => store.getState().updateSettings("telephony", { hangupEndpoint: e.target.value })} />
            </Field>
            <Field label={t("settings.transferEndpoint")}>
              <Input dir="ltr" value={s.telephony.transferEndpoint} onChange={(e) => store.getState().updateSettings("telephony", { transferEndpoint: e.target.value })} />
            </Field>
          </SectionCard>
        </TabsContent>

        {/* --------------------------------- AI --------------------------------- */}
        <TabsContent value="ai" className="mt-4">
          <SectionCard title={t("settings.tabAI")} icon={<Bot className="size-4 text-primary" />}>
            <Field label={t("settings.llmProvider")}>
              <Select value={s.aiModels.provider} onValueChange={(v) => store.getState().updateSettings("aiModels", { provider: v as "ollama" | "custom" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">{t("settings.llmOllama")}</SelectItem>
                  <SelectItem value="custom">{t("settings.llmCustom")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("settings.llmBaseUrl")}>
              <Input dir="ltr" value={s.aiModels.baseUrl} onChange={(e) => store.getState().updateSettings("aiModels", { baseUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.llmModel")}>
              <Input dir="ltr" value={s.aiModels.model} onChange={(e) => store.getState().updateSettings("aiModels", { model: e.target.value })} />
            </Field>
            <Field label={`${t("settings.temperature")} — ${s.aiModels.temperature}`}>
              <Slider
                value={[s.aiModels.temperature]}
                min={0} max={1} step={0.05}
                onValueChange={([v]) => store.getState().updateSettings("aiModels", { temperature: v })}
                className="mt-2"
              />
            </Field>
            <Field label={t("settings.maxTokens")}>
              <Input dir="ltr" type="number" className="tnum" value={s.aiModels.maxTokens} onChange={(e) => store.getState().updateSettings("aiModels", { maxTokens: Number(e.target.value) || 256 })} />
            </Field>
          </SectionCard>
        </TabsContent>

        {/* ------------------------------ STT / TTS ----------------------------- */}
        <TabsContent value="stt" className="mt-4">
          <SectionCard title={t("settings.tabSTT")} icon={<Mic className="size-4 text-primary" />}>
            <Field label={t("settings.sttProvider")}>
              <Select value={s.stt.provider} onValueChange={(v) => store.getState().updateSettings("stt", { provider: v as "whisper_cpp" | "vosk" | "custom" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whisper_cpp">{t("settings.sttWhisper")}</SelectItem>
                  <SelectItem value="vosk">{t("settings.sttVosk")}</SelectItem>
                  <SelectItem value="custom">{t("settings.llmCustom")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("settings.llmBaseUrl")}>
              <Input dir="ltr" value={s.stt.baseUrl} onChange={(e) => store.getState().updateSettings("stt", { baseUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.sttModel")}>
              <Input dir="ltr" value={s.stt.model} onChange={(e) => store.getState().updateSettings("stt", { model: e.target.value })} />
            </Field>
            <Field label={t("settings.sttLanguage")}>
              <Select value={s.stt.language} onValueChange={(v) => store.getState().updateSettings("stt", { language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية (عام)</SelectItem>
                  <SelectItem value="ar-EG">المصرية</SelectItem>
                  <SelectItem value="ar-SA">الخليجية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </SectionCard>
        </TabsContent>

        <TabsContent value="tts" className="mt-4">
          <SectionCard title={t("settings.tabTTS")} icon={<Volume2 className="size-4 text-primary" />}>
            <Field label={t("settings.ttsProvider")}>
              <Select value={s.tts.provider} onValueChange={(v) => store.getState().updateSettings("tts", { provider: v as "local" | "custom" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">{t("settings.ttsLocal")}</SelectItem>
                  <SelectItem value="custom">{t("settings.llmCustom")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("settings.llmBaseUrl")}>
              <Input dir="ltr" value={s.tts.baseUrl} onChange={(e) => store.getState().updateSettings("tts", { baseUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.ttsVoice")}>
              <Input value={s.tts.voice} onChange={(e) => store.getState().updateSettings("tts", { voice: e.target.value })} />
            </Field>
            <Field label={`${t("settings.ttsSpeed")} — ×${s.tts.speed.toFixed(1)}`}>
              <Slider
                value={[s.tts.speed]}
                min={0.5} max={1.5} step={0.05}
                onValueChange={([v]) => store.getState().updateSettings("tts", { speed: v })}
                className="mt-2"
              />
            </Field>
          </SectionCard>
        </TabsContent>

        {/* ------------------------------ database ------------------------------ */}
        <TabsContent value="database" className="mt-4">
          <SectionCard title={t("settings.tabDatabase")} icon={<Database className="size-4 text-primary" />} desc={t("settings.dbNote")}>
            <Field label={t("settings.supabaseUrl")}>
              <Input dir="ltr" placeholder="https://your-project.supabase.co" value={s.database.supabaseUrl} onChange={(e) => store.getState().updateSettings("database", { supabaseUrl: e.target.value })} />
            </Field>
            <Field label={t("settings.supabaseAnonKey")}>
              <Input dir="ltr" type="password" placeholder="eyJhbGciOi…" value={s.database.supabaseAnonKey} onChange={(e) => store.getState().updateSettings("database", { supabaseAnonKey: e.target.value })} />
            </Field>
          </SectionCard>
        </TabsContent>

        {/* ------------------------------ transfer ------------------------------ */}
        <TabsContent value="transfer" className="mt-4 space-y-4">
          <SectionCard title={t("settings.tabTransfer")} icon={<PhoneForwarded className="size-4 text-primary" />} desc={t("settings.transferRulesHint")}>
            <Field label={t("settings.supportPhone")}>
              <Input dir="ltr" className="tnum" value={s.transfer.supportPhone} onChange={(e) => store.getState().updateSettings("transfer", { supportPhone: e.target.value })} />
            </Field>
            <Field label={t("settings.salesPhone")}>
              <Input dir="ltr" className="tnum" value={s.transfer.salesPhone} onChange={(e) => store.getState().updateSettings("transfer", { salesPhone: e.target.value })} />
            </Field>
            <Field label={t("settings.fallbackPhone")}>
              <Input dir="ltr" className="tnum" value={s.transfer.fallbackPhone} onChange={(e) => store.getState().updateSettings("transfer", { fallbackPhone: e.target.value })} />
            </Field>
          </SectionCard>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("settings.transferRules")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.transfer.rules.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-2 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-center">
                  <Input
                    className="flex-1 text-sm"
                    value={rule.condition}
                    onChange={(e) =>
                      store.getState().updateSettings("transfer", {
                        rules: s.transfer.rules.map((r) => (r.id === rule.id ? { ...r, condition: e.target.value } : r)),
                      })
                    }
                  />
                  <Select
                    value={rule.destination}
                    onValueChange={(v) =>
                      store.getState().updateSettings("transfer", {
                        rules: s.transfer.rules.map((r) => (r.id === rule.id ? { ...r, destination: v as TransferRule["destination"] } : r)),
                      })
                    }
                  >
                    <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">{t("settings.destSales")}</SelectItem>
                      <SelectItem value="support">{t("settings.destSupport")}</SelectItem>
                      <SelectItem value="fallback">{t("settings.destFallback")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    aria-label={t("common.delete")}
                    onClick={() =>
                      store.getState().updateSettings("transfer", { rules: s.transfer.rules.filter((r) => r.id !== rule.id) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  store.getState().updateSettings("transfer", {
                    rules: [...s.transfer.rules, { id: uid("tr"), condition: "", destination: "sales" }],
                  })
                }
              >
                <Plus className="size-4" />
                {t("settings.addRule")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------- security / notifications -------------------- */}
        <TabsContent value="security" className="mt-4">
          <SectionCard title={t("settings.tabSecurity")} icon={<ShieldCheck className="size-4 text-primary" />}>
            <Field label={t("settings.sessionTimeout")}>
              <Input
                dir="ltr" type="number" className="tnum" min={5}
                value={s.security.sessionTimeoutMin}
                onChange={(e) => store.getState().updateSettings("security", { sessionTimeoutMin: Number(e.target.value) || 60 })}
              />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3.5 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">{t("settings.require2fa")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.dbNote")}</p>
              </div>
              <Switch
                checked={s.security.require2fa}
                onCheckedChange={(v) => store.getState().updateSettings("security", { require2fa: v })}
                aria-label={t("settings.require2fa")}
              />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <SectionCard title={t("settings.tabNotifications")} icon={<BellRing className="size-4 text-primary" />}>
            {([
              ["onCallCompleted", "settings.onCallCompleted"],
              ["onLeadTransferred", "settings.onLeadTransferred"],
              ["onFollowUpDue", "settings.onFollowUpDue"],
              ["dailySummary", "settings.dailySummary"],
            ] as const).map(([key, labelKey]) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3.5 sm:col-span-2">
                <p className="text-sm">{t(labelKey)}</p>
                <Switch
                  checked={s.notifications[key]}
                  onCheckedChange={(v) => store.getState().updateSettings("notifications", { [key]: v } as Partial<AppSettings["notifications"]>)}
                  aria-label={t(labelKey)}
                />
              </div>
            ))}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionCard({
  title,
  desc,
  icon,
  children,
}: {
  title: string;
  desc?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        {desc ? <CardDescription>{desc}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
