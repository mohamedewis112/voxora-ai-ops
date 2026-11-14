"use client";

/**
 * 3-step contact import wizard: upload CSV/XLSX → map columns → review & import.
 * Parsing is fully client-side (papaparse for CSV, SheetJS for Excel).
 * Duplicate detection uses both the existing store contacts and repeated
 * numbers inside the file itself.
 */

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { isValidEgyptianPhone, uid, type Contact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FieldKey = "name" | "phone" | "business" | "category" | "area" | "notes";

const FIELDS: FieldKey[] = ["name", "phone", "business", "category", "area", "notes"];

const FIELD_LABEL: Record<FieldKey, string> = {
  name: "import.mapName",
  phone: "import.mapPhone",
  business: "import.mapBusiness",
  category: "import.mapCategory",
  area: "import.mapArea",
  notes: "import.mapNotes",
};

/** Keyword hints used to auto-guess the column mapping (Arabic + English). */
const GUESS: Record<FieldKey, RegExp> = {
  name: /(الاسم|اسم|name)/i,
  phone: /(هاتف|رقم|جوال|mobile|phone)/i,
  business: /(نشاط|شركة|business)/i,
  category: /(تصنيف|category)/i,
  area: /(منطقة|area)/i,
  notes: /(ملاحظات|notes)/i,
};

/** Sentinel value for "ignore this field" (Radix Select needs non-empty values). */
const IGNORE = "__ignore__";

type Mapping = Record<FieldKey, string>;

const blankMapping = (): Mapping => ({ name: "", phone: "", business: "", category: "", area: "", notes: "" });

/** Strip spaces/dashes/parens and unify +20 / 0020 prefixes to a leading 0. */
const normalizePhone = (raw: string): string =>
  raw.replace(/[\s\-()+]/g, "").replace(/^(0020|\+?20)/, "0");

/** Safe cell read: returns "" for unmapped (index < 0) or missing cells. */
const cell = (row: string[], i: number): string => (i >= 0 ? row[i] || "" : "");

function StepChip({
  n,
  active,
  label,
  onClick,
  disabled,
}: {
  n: number;
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/70 text-muted-foreground hover:bg-accent"
      )}
    >
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full text-[10px] tnum",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {n}
      </span>
      {label}
    </button>
  );
}

function SummaryTile({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3 text-center">
      <p className={cn("text-xl font-semibold tnum", tone)}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useI18n();
  const store = useDataStore;
  const contacts = useDataStore((s) => s.contacts);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(blankMapping);
  const [auto, setAuto] = useState<FieldKey[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-seed the wizard whenever it is opened: every import starts fresh.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setStep(1);
      setFileName(null);
      setHeaders([]);
      setRows([]);
      setMapping(blankMapping());
      setAuto([]);
      setSkipDuplicates(true);
    }
  }

  const phoneIdx = mapping.phone ? headers.indexOf(mapping.phone) : -1;
  const idx = (f: FieldKey) => (mapping[f] ? headers.indexOf(mapping[f]) : -1);

  const existingPhones = useMemo(
    () => new Set(contacts.map((c) => normalizePhone(c.phone))),
    [contacts]
  );

  const classified = useMemo(() => {
    const pIdx = mapping.phone ? headers.indexOf(mapping.phone) : -1;
    const valid: string[][] = [];
    const dups: string[][] = [];
    const invalid: string[][] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const phone = normalizePhone(cell(row, pIdx));
      if (!phone || !isValidEgyptianPhone(phone)) {
        invalid.push(row);
        continue;
      }
      if (existingPhones.has(phone) || seen.has(phone)) {
        dups.push(row);
        seen.add(phone);
        continue;
      }
      seen.add(phone);
      valid.push(row);
    }
    return { valid, dups, invalid };
  }, [rows, headers, mapping, existingPhones]);

  const importList = skipDuplicates ? classified.valid : [...classified.valid, ...classified.dups];
  const validCount = importList.length;

  const loadFile = async (file: File) => {
    try {
      let matrix: string[][] = [];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text, { header: false });
        matrix = parsed.data as string[][];
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        matrix = aoa.map((r) => r.map((v) => String(v ?? "")));
      }
      const normalized = matrix.map((r) => r.map((v) => String(v ?? "").trim()));
      const head = normalized[0] ?? [];
      if (head.length === 0 || head.every((h) => h === "")) {
        toast.error(t("common.noData"));
        return;
      }
      const dataRows = normalized.slice(1).filter((r) => r.some((v) => v !== ""));
      setFileName(file.name);
      setHeaders(head);
      setRows(dataRows);
      // Auto-guess the mapping from common Arabic / English column names.
      const guessed = blankMapping();
      const hits: FieldKey[] = [];
      for (const f of FIELDS) {
        const i = head.findIndex((h) => GUESS[f].test(h));
        if (i >= 0) {
          guessed[f] = head[i];
          hits.push(f);
        }
      }
      setMapping(guessed);
      setAuto(hits);
      setStep(2);
    } catch {
      toast.error(t("common.noData"));
    }
  };

  const doImport = () => {
    const now = new Date().toISOString();
    const list: Contact[] = importList.map((row) => ({
      id: uid("cnt"),
      name: cell(row, idx("name")),
      phone: normalizePhone(cell(row, idx("phone"))),
      business: cell(row, idx("business")),
      category: cell(row, idx("category")),
      city: "",
      area: cell(row, idx("area")),
      source: "إكسل مستورد",
      status: "active",
      tags: [],
      campaignId: null,
      lastCallAt: null,
      nextFollowUpAt: null,
      notes: cell(row, idx("notes")),
      createdAt: now,
    }));
    store.getState().addContacts(list);
    toast.success(t("import.importedToast", { count: list.length }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">{t("import.title")}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
          <StepChip n={1} active={step === 1} label={t("import.step1")} onClick={() => setStep(1)} />
          <StepChip n={2} active={step === 2} label={t("import.step2")} onClick={() => setStep(2)} disabled={rows.length === 0} />
          <StepChip
            n={3}
            active={step === 3}
            label={t("import.step3")}
            onClick={() => setStep(3)}
            disabled={rows.length === 0 || phoneIdx < 0}
          />
        </div>

        <div className="px-5 py-5">
          {/* Step 1 — upload */}
          {step === 1 ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void loadFile(f);
                }}
                className="w-full rounded-xl border border-dashed p-8 text-center transition-colors hover:bg-accent/50"
              >
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-medium">{t("import.upload")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.formats")}</p>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                aria-label={t("import.chooseFile")}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadFile(f);
                  e.target.value = "";
                }}
              />
              {fileName ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                    <FileSpreadsheet className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{fileName}</span>
                    <Badge variant="secondary" className="shrink-0 tnum">{rows.length} {t("import.rows")}</Badge>
                  </span>
                  <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => inputRef.current?.click()}>
                    {t("import.replaceFile")}
                  </Button>
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
                <Button disabled={!fileName} onClick={() => setStep(2)}>{t("common.confirm")}</Button>
              </div>
            </div>
          ) : null}

          {/* Step 2 — column mapping */}
          {step === 2 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f} className="space-y-1.5 rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`map-${f}`}>{t(FIELD_LABEL[f])}</Label>
                      {auto.includes(f) ? (
                        <Badge variant="secondary" className="text-[10px]">{t("import.autoDetected")}</Badge>
                      ) : null}
                    </div>
                    <Select
                      value={mapping[f] || IGNORE}
                      onValueChange={(v) => {
                        setMapping((m) => ({ ...m, [f]: v === IGNORE ? "" : v }));
                        setAuto((a) => a.filter((x) => x !== f));
                      }}
                    >
                      <SelectTrigger id={`map-${f}`} className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>—</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {f === "phone" && !mapping.phone ? (
                      <p className="text-xs text-rose-500">{t("import.noPhoneColumn")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <label
                htmlFor="skip-duplicates"
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2.5 text-sm transition-colors hover:bg-accent"
              >
                <Checkbox
                  id="skip-duplicates"
                  checked={skipDuplicates}
                  onCheckedChange={(v) => setSkipDuplicates(v === true)}
                />
                {t("import.skipDuplicates")}
              </label>
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>{t("common.cancel")}</Button>
                <Button disabled={!mapping.phone} onClick={() => setStep(3)}>{t("common.confirm")}</Button>
              </div>
            </div>
          ) : null}

          {/* Step 3 — review & import */}
          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile value={validCount} label={t("import.valid")} tone="text-emerald-500" />
                <SummaryTile value={classified.dups.length} label={t("import.duplicates")} tone="text-amber-500" />
                <SummaryTile value={classified.invalid.length} label={t("import.invalid")} tone="text-rose-500" />
                <SummaryTile value={rows.length} label={t("import.rows")} tone="text-foreground" />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{t("import.preview")}</p>
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        {FIELDS.map((f) => (
                          <TableHead key={f}>{t(FIELD_LABEL[f])}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 8).map((row, i) => (
                        <TableRow key={i}>
                          {FIELDS.map((f) => {
                            const v = cell(row, idx(f));
                            return (
                              <TableCell
                                key={f}
                                dir={f === "phone" ? "ltr" : undefined}
                                className={cn("text-[13px] text-muted-foreground", f === "phone" && "tnum")}
                              >
                                {v || "—"}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={FIELDS.length} className="py-6 text-center text-xs text-muted-foreground">
                            {t("common.noData")}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>{t("common.cancel")}</Button>
                <Button disabled={validCount === 0 || phoneIdx < 0} onClick={doImport}>
                  <Upload className="size-4" />
                  {t("import.importBtn", { count: validCount })}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
