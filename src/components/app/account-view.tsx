"use client";

/**
 * Account screen — profile, role switcher and password placeholder.
 * Roles map 1:1 to the future Supabase Auth + RLS policies (see docs).
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { roleMeta } from "@/lib/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["admin", "manager", "sales_agent", "viewer"] as const;

export function AccountView() {
  const { t } = useI18n();
  const { view, setView, authed, account, updateAccount } = useUiStore();

  useEffect(() => {
    if (authed && (view === "login" || view === "forgot")) setView("dashboard");
  }, [authed, view, setView]);

  return (
    <div className="space-y-5">
      <PageHeader title={t("account.title")} desc={t("account.desc")} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("common.profile")}</CardTitle>
            <CardDescription>{t("account.sessionActive")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">{t("account.name")}</Label>
              <Input id="acc-name" value={account.name} onChange={(e) => updateAccount({ name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-email">{t("common.email")}</Label>
              <Input id="acc-email" dir="ltr" value={account.email} disabled />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("common.role")}</Label>
              <Select value={account.role} onValueChange={(v) => updateAccount({ role: v as typeof account.role })}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`role.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => toast.success(t("common.savedToast"))}>{t("common.saveChanges")}</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("account.changePassword")}</CardTitle>
            <CardDescription>{t("settings.dbNote")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("account.currentPassword")}</Label>
              <Input type="password" dir="ltr" placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("account.newPassword")}</Label>
              <Input type="password" dir="ltr" placeholder="••••••••" />
            </div>
            <div className="sm:col-span-2">
              <Button variant="secondary" onClick={() => toast.info(t("toast.soon"))}>
                {t("account.changePassword")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("account.rolesTitle")}</CardTitle>
          <CardDescription>{t("account.rolesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{t(`role.${r}`)}</p>
                <StatusBadge tone={roleMeta[r].tone} label={t(`role.${r}`)} dot={false} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t(`roleDesc.${r}`)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
