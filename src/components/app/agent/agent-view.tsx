"use client";

/**
 * Agent Builder — configuration (identity, voice, personality, prompt,
 * behavioral policy) + the structured conversation-flow editor with
 * conditions. Saved into the data store; consumed by the future LLM engine.
 */

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CircleAlert,
  GitBranch,
  ListPlus,
  MessageSquareText,
  PhoneForwarded,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScanSearch,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { DEFAULT_AGENT } from "@/lib/demo-data";
import type { AgentConfig, AgentLanguage, AgentPersonality, AgentType, FlowCondition, FlowStep, FlowStepKind } from "@/lib/types";
import { uid } from "@/lib/types";
import { PageHeader } from "@/components/app/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AGENT_TYPES: AgentType[] = ["customer_service", "sales", "followup", "appointments", "custom"];
const TYPE_KEYS: Record<AgentType, string> = {
  customer_service: "agent.typeCustomerService",
  sales: "agent.typeSales",
  followup: "agent.typeFollowup",
  appointments: "agent.typeAppointments",
  custom: "agent.typeCustom",
};
const LANGS: AgentLanguage[] = ["ar_eg", "ar_gulf", "ar_msa", "en"];
const PERSONALITIES: AgentPersonality[] = ["professional", "friendly", "formal", "sales_focused", "service_focused"];
const PERSONALITY_KEYS: Record<AgentPersonality, string> = {
  professional: "agent.personalityProfessional",
  friendly: "agent.personalityFriendly",
  formal: "agent.personalityFormal",
  sales_focused: "agent.personalitySales",
  service_focused: "agent.personalityService",
};
const VOICES = [
  { id: "salma_ar_eg", label: "سلمى — أنثوي مصري دافئ" },
  { id: "youssef_ar_eg", label: "يوسف — رجالي مصري واضح" },
  { id: "msa_female", label: "سلمى فصحى — أنثوي رسمي" },
  { id: "en_male", label: "Omar — English male" },
];

export function AgentView() {
  const { t } = useI18n();
  const agent = useDataStore((s) => s.agent);
  const updateAgent = useDataStore((s) => s.updateAgent);
  const [draft, setDraft] = useState<AgentConfig>(agent);
  const [infoInput, setInfoInput] = useState("");

  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    updateAgent(draft);
    toast.success(t("agent.savedToast"));
  };

  const addInfo = () => {
    const v = infoInput.trim();
    if (!v) return;
    set("collectInfo", [...draft.collectInfo, v]);
    setInfoInput("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("agent.title")}
        desc={t("agent.desc")}
        actions={
          <Button onClick={save}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        }
      />

      <Tabs defaultValue="config">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-muted/60 p-1 sm:w-auto">
          <TabsTrigger value="config" className="gap-1.5 rounded-lg px-3 data-[state=active]:bg-card">
            <Bot className="size-4" /> {t("agent.configTab")}
          </TabsTrigger>
          <TabsTrigger value="flow" className="gap-1.5 rounded-lg px-3 data-[state=active]:bg-card">
            <GitBranch className="size-4" /> {t("agent.flowTab")}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ config ------------------------------ */}
        <TabsContent value="config" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("agent.basicInfo")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("agent.name")}</Label>
                  <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("agent.jobTitle")}</Label>
                  <Input value={draft.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("agent.type")}</Label>
                  <Select value={draft.type} onValueChange={(v) => set("type", v as AgentType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGENT_TYPES.map((x) => (
                        <SelectItem key={x} value={x}>{t(TYPE_KEYS[x])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("agent.maxDuration")}</Label>
                  <Input
                    type="number" min={1} max={30} className="tnum"
                    value={draft.maxDurationMin}
                    onChange={(e) => set("maxDurationMin", Number(e.target.value) || 1)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("agent.voice")}</CardTitle>
                <CardDescription>{t("agent.voicePlaceholder")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("agent.voice")}</Label>
                  <Select value={draft.voice} onValueChange={(v) => set("voice", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VOICES.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("agent.language")}</Label>
                  <Select value={draft.language} onValueChange={(v) => set("language", v as AgentLanguage)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGS.map((x) => (
                        <SelectItem key={x} value={x}>{t(`agent.lang${x.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("agent.personality")}</Label>
                  <Select value={draft.personality} onValueChange={(v) => set("personality", v as AgentPersonality)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERSONALITIES.map((x) => (
                        <SelectItem key={x} value={x}>{t(PERSONALITY_KEYS[x])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("agent.systemPrompt")}</CardTitle>
              <CardDescription>{t("agent.systemPromptHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={9} dir="auto" value={draft.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} className="text-[13px] leading-relaxed" />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("agent.greeting")}</Label>
                  <Textarea rows={2} value={draft.greeting} onChange={(e) => set("greeting", e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("agent.closing")}</Label>
                  <Textarea rows={2} value={draft.closing} onChange={(e) => set("closing", e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("agent.objectionHandling")}</Label>
                  <Textarea rows={3} value={draft.objectionHandling} onChange={(e) => set("objectionHandling", e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("agent.transferWhen")}</Label>
                  <Textarea rows={3} value={draft.transferWhen} onChange={(e) => set("transferWhen", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-5">
                  <Label>{t("agent.collectInfo")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{t("agent.collectInfoHint")}</p>
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={infoInput}
                      onChange={(e) => setInfoInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInfo(); } }}
                    />
                    <Button variant="secondary" size="icon" onClick={addInfo} aria-label={t("common.add")}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {draft.collectInfo.map((item) => (
                      <Badge key={item} variant="secondary" className="gap-1 pe-1.5">
                        {item}
                        <button
                          type="button"
                          aria-label={`${t("common.delete")}: ${item}`}
                          onClick={() => set("collectInfo", draft.collectInfo.filter((x) => x !== item))}
                          className="rounded-full p-0.5 hover:bg-destructive/20"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <Label className="text-destructive">{t("agent.neverSay")}</Label>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CircleAlert className="size-3.5 text-destructive" />
                    {t("agent.collectInfoHint")}
                  </p>
                  <Textarea
                    rows={5}
                    className="mt-3 text-[13px]"
                    value={draft.neverSay.join("\n")}
                    onChange={(e) => set("neverSay", e.target.value.split("\n").filter((x) => x.trim() !== "" || true))}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ------------------------------- flow ------------------------------- */}
        <TabsContent value="flow" className="mt-4">
          <FlowBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ flow builder ------------------------------- */

const KIND_ICON: Record<FlowStepKind, typeof MessageSquareText> = {
  start: Play,
  message: MessageSquareText,
  question: ScanSearch,
  condition: GitBranch,
  action: ListPlus,
  transfer: PhoneForwarded,
  end: PhoneForwarded,
};

function FlowBuilder() {
  const { t } = useI18n();
  const agent = useDataStore((s) => s.agent);
  const updateAgent = useDataStore((s) => s.updateAgent);
  const [editing, setEditing] = useState<FlowStep | null>(null);

  const steps = agent.flow;
  const persist = (next: FlowStep[]) => updateAgent({ flow: next });

  const move = (id: string, offset: number) => {
    const idx = steps.findIndex((s) => s.id === id);
    const next = idx + offset;
    if (idx < 0 || next < 0 || next >= steps.length) return;
    const arr = [...steps];
    const [it] = arr.splice(idx, 1);
    arr.splice(next, 0, it);
    persist(arr);
  };

  const remove = (id: string) => persist(steps.filter((s) => s.id !== id));

  const addStep = () => {
    const step: FlowStep = { id: uid("fs"), kind: "message", title: t("flow.stepTitle"), prompt: "" };
    persist([...steps, step]);
    setEditing(step);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addStep}>
          <Plus className="size-4" />
          {t("flow.addStep")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { updateAgent({ flow: DEFAULT_AGENT.flow }); toast.success(t("flow.reset")); }}
        >
          <RotateCcw className="size-4" />
          {t("flow.reset")}
        </Button>
        <p className="ms-auto max-w-md text-[11px] leading-relaxed text-muted-foreground/70">{t("flow.engineNote")}</p>
      </div>

      <div className="relative">
        {/* Connector line */}
        <span aria-hidden="true" className="absolute inset-y-4 start-[27px] w-px bg-border" />
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = KIND_ICON[step.kind];
            return (
              <div key={step.id} className="relative flex gap-3">
                <span className="relative z-10 mt-3 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <div className="flex-1 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground/70 tnum">{i + 1}.</span>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        {t(`flow.kind${step.kind.charAt(0).toUpperCase()}${step.kind.slice(1)}`)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => move(step.id, -1)} aria-label={t("flow.moveUp")}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => move(step.id, 1)} aria-label={t("flow.moveDown")}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(step)}>
                        {t("common.edit")}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => remove(step.id)} aria-label={t("common.delete")}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {step.prompt ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.prompt}</p>
                  ) : null}
                  {step.conditions && step.conditions.length > 0 ? (
                    <div className="mt-3 space-y-1.5 rounded-lg border border-dashed border-border p-2.5">
                      {step.conditions.map((c) => (
                        <p key={c.id} className="text-xs leading-relaxed">
                          <span className="font-semibold text-amber-500">{t("flow.if")}:</span>{" "}
                          <span>{c.when}</span>{" "}
                          <span className="mx-1 text-muted-foreground">→</span>{" "}
                          <span className="font-medium text-primary">{c.then}</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <FlowStepDialog
        step={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSave={(next) => {
          persist(steps.map((s) => (s.id === next.id ? next : s)));
          setEditing(null);
        }}
      />
    </div>
  );
}

function FlowStepDialog({
  step,
  onOpenChange,
  onSave,
}: {
  step: FlowStep | null;
  onOpenChange: (o: boolean) => void;
  onSave: (s: FlowStep) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<FlowStep | null>(step);
  if (step && (!draft || draft.id !== step.id)) setDraft(step);
  if (!step || !draft) return null;

  const set = (patch: Partial<FlowStep>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setCondition = (cid: string, patch: Partial<FlowCondition>) =>
    set({ conditions: (draft.conditions ?? []).map((c) => (c.id === cid ? { ...c, ...patch } : c)) });

  const KINDS: FlowStepKind[] = ["start", "message", "question", "condition", "action", "transfer", "end"];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">{t("flow.editStep")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("flow.stepTitle")}</Label>
              <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("flow.stepKind")}</Label>
              <Select value={draft.kind} onValueChange={(v) => set({ kind: v as FlowStepKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{t(`flow.kind${k.charAt(0).toUpperCase()}${k.slice(1)}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("flow.stepPrompt")}</Label>
            <Textarea rows={3} dir="auto" value={draft.prompt ?? ""} onChange={(e) => set({ prompt: e.target.value })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("flow.conditions")}</Label>
              <Button
                variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => set({ conditions: [...(draft.conditions ?? []), { id: uid("fc"), when: "", then: "" }] })}
              >
                <Plus className="size-3.5" /> {t("flow.addCondition")}
              </Button>
            </div>
            {(draft.conditions ?? []).map((c) => (
              <div key={c.id} className="space-y-1.5 rounded-lg border border-border/70 p-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {t("flow.if")}
                  </span>
                  <Input className="h-8 text-xs" value={c.when} onChange={(e) => setCondition(c.id, { when: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {t("flow.then")}
                  </span>
                  <Input className="h-8 text-xs" value={c.then} onChange={(e) => setCondition(c.id, { then: e.target.value })} />
                </div>
                <button
                  type="button"
                  className="ms-auto inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
                  onClick={() => set({ conditions: (draft.conditions ?? []).filter((x) => x.id !== c.id) })}
                >
                  <Trash2 className="size-3" /> {t("common.delete")}
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => onSave(draft)}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
