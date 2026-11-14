"use client";

/**
 * Knowledge Base module — article cards with search/category/type filters and
 * a full create/edit dialog (text article, FAQ editor or file reference).
 * Categories are stored as the localized label string (see ArticleDialog).
 */

import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  FileText,
  HelpCircle,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import type { KBItem, KBQuestion, KBType } from "@/lib/types";
import { uid } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KB_TYPES: KBType[] = ["text", "faq", "file"];
const TYPE_KEYS: Record<KBType, string> = {
  text: "kb.typeText",
  faq: "kb.typeFaq",
  file: "kb.typeFile",
};
/** Stored as the localized label string (matches demo data). */
const CATEGORY_KEYS = [
  "kb.categoryAbout",
  "kb.categoryPricing",
  "kb.categoryProducts",
  "kb.categoryPolicies",
  "kb.categoryRegistration",
  "kb.categoryFaq",
] as const;

function emptyQuestion(): KBQuestion {
  return { id: uid("fq"), q: "", a: "" };
}

function blankKB(): KBItem {
  return {
    id: "",
    title: "",
    category: "",
    type: "text",
    content: "",
    faq: [],
    fileName: null,
    tags: [],
    updatedAt: new Date().toISOString(),
    active: true,
  };
}

export function KnowledgeView() {
  const { t } = useI18n();
  const store = useDataStore;
  const kb = useDataStore((s) => s.kb);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState<KBType | "all">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KBItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kb.filter((k) => {
      if (category !== "all" && k.category !== category) return false;
      if (type !== "all" && k.type !== type) return false;
      if (!q) return true;
      return `${k.title} ${k.content} ${k.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [kb, search, category, type]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("kb.title")}
        desc={t("kb.desc")}
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            {t("kb.add")}
          </Button>
        }
      />

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("kb.searchPlaceholder")}
              className="h-9 ps-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {CATEGORY_KEYS.map((key) => (
                <SelectItem key={key} value={t(key)}>
                  {t(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as KBType | "all")}>
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {KB_TYPES.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(TYPE_KEYS[x])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Articles */}
      {kb.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t("kb.noArticles")}
          desc={t("kb.noArticlesDesc")}
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> {t("kb.add")}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("common.noResults")} desc={t("common.noResultsDesc")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((item) => (
            <KBCard
              key={item.id}
              item={item}
              onEdit={() => {
                setEditing(item);
                setDialogOpen(true);
              }}
              onDelete={() => setConfirmDelete(item.id)}
            />
          ))}
        </div>
      )}

      <ArticleDialog open={dialogOpen} onOpenChange={setDialogOpen} article={editing} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
        title={t("kb.title")}
        desc={t("common.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (confirmDelete) store.getState().deleteKB(confirmDelete);
          toast.success(t("common.deleteToast"));
        }}
      />
    </div>
  );
}

/* ---------------------------------- card ----------------------------------- */

function KBCard({ item, onEdit, onDelete }: { item: KBItem; onEdit: () => void; onDelete: () => void }) {
  const { t, fmtDate } = useI18n();
  const store = useDataStore;
  const linked = useDataStore((s) => s.campaigns.filter((c) => c.knowledgeIds.includes(item.id)).length);

  return (
    <Card className={cn("flex flex-col border-border/70", !item.active && "opacity-70")}>
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-[15px] font-semibold">{item.title}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone="neutral" label={item.category} dot={false} />
          <StatusBadge tone="info" label={t(TYPE_KEYS[item.type])} dot={false} />
        </div>

        {item.type === "faq" ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="tnum">{item.faq.length}</span> {t("kb.faqTitle")}
          </p>
        ) : item.type === "file" ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.fileName ?? t("kb.file")}</span>
          </p>
        ) : (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.content}</p>
        )}

        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {fmtDate(item.updatedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="size-3.5" aria-hidden="true" />
            {t("kb.linked")}: <span className="tnum">{linked}</span>
          </span>
          <div className="ms-auto flex items-center gap-1">
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={item.active}
                aria-label={t("kb.active")}
                onCheckedChange={(v) => store.getState().updateKB(item.id, { active: v })}
              />
              {t("kb.active")}
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("common.edit")}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-rose-500 hover:text-rose-500"
              aria-label={t("common.delete")}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ create / edit ------------------------------ */

function ArticleDialog({
  open,
  onOpenChange,
  article,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  article: KBItem | null;
}) {
  const { t } = useI18n();
  const store = useDataStore;

  const [form, setForm] = useState<KBItem>(() => article ?? blankKB());
  const [key, setKey] = useState(0);
  const [tagInput, setTagInput] = useState("");

  // Re-seed the form whenever the dialog opens for a different article.
  const formKey = `${open}-${article?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setForm(article ?? { ...blankKB(), category: t("kb.categoryAbout") });
    setTagInput("");
    setKey((k) => k + 1);
  }

  const set = <K extends keyof KBItem>(k: K, v: KBItem[K]) => setForm((f) => ({ ...f, [k]: v }));

  const setFaq = (id: string, field: "q" | "a", v: string) =>
    setForm((f) => ({ ...f, faq: f.faq.map((x) => (x.id === id ? { ...x, [field]: v } : x)) }));

  const addFaq = () => setForm((f) => ({ ...f, faq: [...f.faq, emptyQuestion()] }));

  const addTag = () => {
    const v = tagInput.trim();
    if (!v || form.tags.includes(v)) {
      setTagInput("");
      return;
    }
    set("tags", [...form.tags, v]);
    setTagInput("");
  };

  const save = () => {
    if (!form.title.trim()) {
      toast.error(t("common.required"));
      return;
    }
    const payload: Partial<KBItem> = {
      title: form.title.trim(),
      category: form.category || t("kb.categoryAbout"),
      type: form.type,
      content: form.content,
      faq: form.faq.filter((x) => x.q.trim() !== "" || x.a.trim() !== ""),
      fileName: form.fileName,
      tags: form.tags,
      active: form.active,
    };
    if (article) {
      store.getState().updateKB(article.id, payload);
      toast.success(t("common.savedToast"));
    } else {
      store.getState().addKB(payload);
      toast.success(t("common.createdToast"));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-xl sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">{article ? t("kb.edit") : t("kb.add")}</DialogTitle>
        </DialogHeader>
        <div key={key} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("kb.articleTitle")}</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kb.articleType")}</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v as KBType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KB_TYPES.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(TYPE_KEYS[x])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.category")}</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("common.category")} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_KEYS.map((k) => (
                  <SelectItem key={k} value={t(k)}>
                    {t(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.type === "text" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("kb.content")}</Label>
              <Textarea rows={7} value={form.content} onChange={(e) => set("content", e.target.value)} />
            </div>
          ) : null}

          {form.type === "faq" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("kb.faqTitle")}</Label>
              {form.faq.map((q) => (
                <div key={q.id} className="relative space-y-2 rounded-xl border border-border/70 p-3 pe-10">
                  <Input
                    value={q.q}
                    placeholder={t("kb.question")}
                    onChange={(e) => setFaq(q.id, "q", e.target.value)}
                  />
                  <Input
                    value={q.a}
                    placeholder={t("kb.answer")}
                    onChange={(e) => setFaq(q.id, "a", e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute end-1.5 top-1.5 size-7 text-muted-foreground hover:text-destructive"
                    aria-label={t("common.delete")}
                    onClick={() => set("faq", form.faq.filter((x) => x.id !== q.id))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addFaq}>
                <Plus className="size-3.5" /> {t("kb.addQuestion")}
              </Button>
            </div>
          ) : null}

          {form.type === "file" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("kb.file")}</Label>
              <Input disabled placeholder={t("kb.filePlaceholder")} />
              {form.fileName ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="size-3.5" aria-hidden="true" />
                  {form.fileName}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Tags (chip input) */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("common.tags")}</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t("common.add")}
              />
              <Button variant="secondary" size="icon" onClick={addTag} aria-label={t("common.add")}>
                <Plus className="size-4" />
              </Button>
            </div>
            {form.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pe-1.5">
                    {tag}
                    <button
                      type="button"
                      aria-label={`${t("common.delete")}: ${tag}`}
                      onClick={() => set("tags", form.tags.filter((x) => x !== tag))}
                      className="rounded-full p-0.5 hover:bg-destructive/20"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2.5 sm:col-span-2">
            <Label htmlFor="kb-active" className="text-sm font-normal">
              {t("kb.active")}
            </Label>
            <Switch id="kb-active" checked={form.active} onCheckedChange={(v) => set("active", v)} />
          </div>

          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
