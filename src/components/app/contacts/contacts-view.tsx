"use client";

/**
 * Contacts CRM — searchable/filterable customer database with manual CRUD,
 * bulk actions (dnd / archive / assign campaign / delete) and the 3-step
 * CSV / Excel import wizard. Style follows recordings-view:
 * stats → filters card → desktop table → mobile cards → empty state.
 */

import { useMemo, useState } from "react";
import {
  Archive,
  Ban,
  Headphones,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { useUiStore } from "@/stores/ui-store";
import { contactStatusMeta } from "@/lib/status";
import type { Contact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatCard } from "@/components/app/shared/stat-card";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { ContactDialog } from "@/components/app/contacts/contact-dialog";
import { ImportDialog } from "@/components/app/contacts/import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** "القاهرة - مدينة نصر" style label (city + " - " + area). */
const areaLabel = (c: Contact): string => {
  if (c.city && c.area) return `${c.city} - ${c.area}`;
  return c.city || c.area || "—";
};

export function ContactsView() {
  const { t, fmtDate } = useI18n();
  const contacts = useDataStore((s) => s.contacts);
  const campaigns = useDataStore((s) => s.campaigns);
  const store = useDataStore;

  // Header search handoff: seed the filter box from the ui store and keep it in sync.
  const contactsSearch = useUiStore((s) => s.contactsSearch);
  const setContactsSearch = useUiStore((s) => s.setContactsSearch);
  const [search, setSearch] = useState(contactsSearch);
  const [status, setStatus] = useState("all");
  const [campaign, setCampaign] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const filtered = useMemo(
    () =>
      contacts
        .filter((c) => (status === "all" ? true : c.status === status))
        .filter((c) => (campaign === "all" ? true : c.campaignId === campaign))
        .filter((c) => {
          const q = search.trim().toLowerCase();
          return !q || `${c.name} ${c.phone} ${c.business}`.toLowerCase().includes(q);
        }),
    [contacts, status, campaign, search]
  );

  const campaignName = (id: string | null): string =>
    id ? campaigns.find((c) => c.id === id)?.name ?? "—" : "—";

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleDnd = (c: Contact) => {
    const on = c.status !== "dnd";
    store.getState().updateContact(c.id, { status: on ? "dnd" : "active" });
    toast.success(t(on ? "toast.dndOn" : "toast.dndOff"));
  };

  const bulk = (patch: Partial<Contact>) => {
    store.getState().bulkUpdateContacts(selected, patch);
    setSelected([]);
  };

  const removeOne = () => {
    if (confirmDelete) store.getState().deleteContacts([confirmDelete]);
    setSelected((prev) => prev.filter((id) => id !== confirmDelete));
    toast.success(t("common.deleteToast"));
  };

  const bulkDelete = () => {
    store.getState().deleteContacts(selected);
    setSelected([]);
    toast.success(t("common.deleteToast"));
  };

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.includes(c.id));
  const someSelected = selected.length > 0 && !allSelected;

  const dndCount = contacts.filter((c) => c.status === "dnd").length;
  const archivedCount = contacts.filter((c) => c.status === "archived").length;
  const withCampaign = contacts.filter((c) => c.campaignId !== null && c.status === "active").length;

  const rowActions = (c: Contact) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t("common.edit")}
        onClick={() => { setEditing(c); setDialogOpen(true); }}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-8", c.status === "dnd" && "text-rose-500 hover:text-rose-500")}
        aria-label={t("contacts.dndToggle")}
        onClick={() => toggleDnd(c)}
      >
        <Ban className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive hover:text-destructive"
        aria-label={t("common.delete")}
        onClick={() => setConfirmDelete(c.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("contacts.title")}
        desc={t("contacts.desc")}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              {t("contacts.import")}
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="size-4" />
              {t("contacts.add")}
            </Button>
          </>
        }
      />

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("contacts.totalContacts")} value={contacts.length} icon={Users} tone="info" />
        <StatCard label={t("contacts.dndCount")} value={dndCount} icon={Ban} tone="danger" />
        <StatCard label={t("contacts.archivedCount")} value={archivedCount} icon={Archive} tone="neutral" />
        <StatCard label={t("contacts.withCampaign")} value={withCampaign} icon={Headphones} tone="violet" />
      </div>

      {contacts.length === 0 ? (
        <EmptyState icon={Users} title={t("contacts.noContacts")} desc={t("contacts.noContactsDesc")} />
      ) : (
        <>
          {/* Filters */}
          <Card className="border-border/70">
            <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setContactsSearch(e.target.value); }}
                  placeholder={t("common.searchPlaceholder")}
                  className="h-9 ps-9"
                  aria-label={t("common.search")}
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9" aria-label={t("common.status")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {Object.entries(contactStatusMeta).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{t(m.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={campaign} onValueChange={setCampaign}>
                <SelectTrigger className="h-9" aria-label={t("common.campaign")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Bulk selection bar */}
          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-primary/5 p-3">
              <span className="text-sm font-medium tnum">{selected.length} {t("common.selected")}</span>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => bulk({ status: "dnd" })}>
                <Ban className="size-3.5" />
                {t("contacts.bulkDnd")}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => bulk({ status: "archived" })}>
                <Archive className="size-3.5" />
                {t("contacts.bulkArchive")}
              </Button>
              <Popover open={assignOpen} onOpenChange={setAssignOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <Headphones className="size-3.5" />
                    {t("contacts.assignCampaign")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2">
                  <p className="px-2 pb-1 text-[11px] text-muted-foreground">{t("contacts.assignedCampaign")}</p>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-accent"
                    onClick={() => { bulk({ campaignId: null }); setAssignOpen(false); }}
                  >
                    {t("common.none")}
                  </button>
                  {campaigns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full truncate rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-accent"
                      onClick={() => { bulk({ campaignId: c.id }); setAssignOpen(false); }}
                    >
                      {c.name}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setBulkConfirm(true)}>
                <Trash2 className="size-3.5" />
                {t("contacts.bulkDelete")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="ms-auto size-8"
                aria-label={t("common.cancel")}
                onClick={() => setSelected([])}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : null}

          {/* Desktop table */}
          <Card className="hidden overflow-hidden border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t("contacts.bulk")}
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => setSelected(v ? filtered.map((c) => c.id) : [])}
                    />
                  </TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("common.category")}</TableHead>
                  <TableHead>{t("common.area")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("common.source")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("common.campaign")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("common.tags")}</TableHead>
                  <TableHead className="hidden whitespace-nowrap lg:table-cell">{t("contacts.lastCall")}</TableHead>
                  <TableHead className="hidden whitespace-nowrap lg:table-cell">{t("contacts.nextFollowUp")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 60).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`${t("common.selected")}: ${c.name}`}
                        checked={selected.includes(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-[13px] font-medium">{c.name}</p>
                      {c.business ? <p className="truncate text-[11px] text-muted-foreground">{c.business}</p> : null}
                    </TableCell>
                    <TableCell className="tnum text-[13px]" dir="ltr">{c.phone}</TableCell>
                    <TableCell className="hidden text-[13px] text-muted-foreground xl:table-cell">
                      {c.category || "—"}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{areaLabel(c)}</TableCell>
                    <TableCell className="hidden text-[13px] text-muted-foreground xl:table-cell">
                      {c.source || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={contactStatusMeta[c.status].tone}
                        label={t(contactStatusMeta[c.status].key)}
                      />
                    </TableCell>
                    <TableCell className="hidden text-[13px] text-muted-foreground lg:table-cell">
                      {campaignName(c.campaignId)}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {c.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-[13px] text-muted-foreground tnum lg:table-cell">
                      {fmtDate(c.lastCallAt)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-[13px] text-muted-foreground tnum lg:table-cell">
                      {fmtDate(c.nextFollowUpAt)}
                    </TableCell>
                    <TableCell className="text-end">{rowActions(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={Search} title={t("common.noResults")} desc={t("common.noResultsDesc")} />
              </div>
            ) : null}
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {filtered.slice(0, 30).map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    {c.business ? <p className="truncate text-xs text-muted-foreground">{c.business}</p> : null}
                  </div>
                  <StatusBadge
                    tone={contactStatusMeta[c.status].tone}
                    label={t(contactStatusMeta[c.status].key)}
                  />
                </div>
                <p dir="ltr" className="mt-1 text-xs text-muted-foreground tnum">{c.phone}</p>
                <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  <p>{areaLabel(c)} · {c.category || "—"}</p>
                  <p>
                    {t("contacts.lastCall")}: <span className="tnum">{fmtDate(c.lastCallAt)}</span>
                    {" · "}
                    {t("contacts.nextFollowUp")}: <span className="tnum">{fmtDate(c.nextFollowUpAt)}</span>
                  </p>
                  <p>
                    {t("contacts.assignedCampaign")}: {campaignName(c.campaignId)}
                    {" · "}
                    {t("common.source")}: {c.source || "—"}
                  </p>
                </div>
                {c.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => { setEditing(c); setDialogOpen(true); }}
                  >
                    <Pencil className="size-3.5" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 text-xs", c.status === "dnd" && "text-rose-500")}
                    onClick={() => toggleDnd(c)}
                  >
                    <Ban className="size-3.5" />
                    {t("contacts.bulkDnd")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ms-auto size-8 text-destructive hover:text-destructive"
                    aria-label={t("common.delete")}
                    onClick={() => setConfirmDelete(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <EmptyState icon={Search} title={t("common.noResults")} desc={t("common.noResultsDesc")} />
            ) : null}
          </div>
        </>
      )}

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editing} />

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={t("common.confirmDeleteTitle")}
        desc={t("common.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={removeOne}
      />

      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={(o) => { if (!o) setBulkConfirm(false); }}
        title={t("common.confirmDeleteTitle")}
        desc={t("common.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={bulkDelete}
      />
    </div>
  );
}
