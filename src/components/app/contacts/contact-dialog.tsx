"use client";

/**
 * Create / edit contact dialog. The dnd switch doubles as the status control:
 * checked → "dnd"; unchecked → keeps the previous non-dnd status ("active",
 * "archived", …) so editing never accidentally un-archives a contact.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { isValidEgyptianPhone, type Contact } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const NONE = "none";

interface ContactForm {
  name: string;
  phone: string;
  business: string;
  category: string;
  city: string;
  area: string;
  source: string;
  campaignId: string; // "none" → null
  nextFollowUpAt: string; // datetime-local value ("" = empty)
  notes: string;
  tags: string[];
  dnd: boolean;
}

const blank = (): ContactForm => ({
  name: "",
  phone: "",
  business: "",
  category: "",
  city: "",
  area: "",
  source: "",
  campaignId: NONE,
  nextFollowUpAt: "",
  notes: "",
  tags: [],
  dnd: false,
});

const seed = (c: Contact): ContactForm => ({
  name: c.name,
  phone: c.phone,
  business: c.business,
  category: c.category,
  city: c.city,
  area: c.area,
  source: c.source,
  campaignId: c.campaignId ?? NONE,
  nextFollowUpAt: toLocalInput(c.nextFollowUpAt),
  notes: c.notes,
  tags: c.tags,
  dnd: c.status === "dnd",
});

/** ISO string → "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ContactDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact: Contact | null;
}) {
  const { t } = useI18n();
  const store = useDataStore;
  const campaigns = useDataStore((s) => s.campaigns);

  const [form, setForm] = useState<ContactForm>(() => (contact ? seed(contact) : blank()));
  const [tagInput, setTagInput] = useState("");
  const [key, setKey] = useState(0);

  // Re-seed the form whenever the dialog opens for a different contact.
  const formKey = `${open}-${contact?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setForm(contact ? seed(contact) : blank());
    setTagInput("");
    setKey((k) => k + 1);
  }

  const set = <K extends keyof ContactForm>(k: K, v: ContactForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addTag = () => {
    const v = tagInput.trim();
    setTagInput("");
    if (!v || form.tags.includes(v)) return;
    set("tags", [...form.tags, v]);
  };

  const save = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error(t("common.required"));
      return;
    }
    if (!isValidEgyptianPhone(form.phone)) {
      toast.error(t("import.invalid"));
      return;
    }
    const payload: Partial<Contact> = {
      name: form.name.trim(),
      phone: form.phone.replace(/[\s-]/g, "").trim(),
      business: form.business.trim(),
      category: form.category.trim(),
      city: form.city.trim(),
      area: form.area.trim(),
      source: form.source.trim(),
      status: form.dnd ? "dnd" : contact && contact.status !== "dnd" ? contact.status : "active",
      tags: form.tags,
      campaignId: form.campaignId === NONE ? null : form.campaignId,
      nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : null,
      notes: form.notes,
    };
    if (contact) {
      store.getState().updateContact(contact.id, payload);
      toast.success(t("common.savedToast"));
    } else {
      store.getState().addContact(payload);
      toast.success(t("common.createdToast"));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">
            {contact ? t("contacts.editContact") : t("contacts.add")}
          </DialogTitle>
        </DialogHeader>
        <div key={key} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("common.name")}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.phone")}</Label>
            <Input dir="ltr" className="tnum" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.business")}</Label>
            <Input value={form.business} onChange={(e) => set("business", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.category")}</Label>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.city")}</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.area")}</Label>
            <Input value={form.area} onChange={(e) => set("area", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.source")}</Label>
            <Input value={form.source} onChange={(e) => set("source", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("contacts.nextFollowUp")}</Label>
            <Input
              type="datetime-local"
              className="tnum"
              value={form.nextFollowUpAt}
              onChange={(e) => set("nextFollowUpAt", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("contacts.assignedCampaign")}</Label>
            <Select value={form.campaignId} onValueChange={(v) => set("campaignId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("common.none")}</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* DND switch doubles as the status control */}
          <div className="space-y-2 rounded-xl border border-border/70 p-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="contact-dnd">{t("contacts.dndToggle")}</Label>
              <Switch id="contact-dnd" checked={form.dnd} onCheckedChange={(v) => set("dnd", v)} />
            </div>
            <p className="text-xs text-rose-500">{t("contacts.dndWarning")}</p>
          </div>

          {/* Tags chip input */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("common.tags")}</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
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

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("common.notes")}</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{contact ? t("common.saveChanges") : t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
