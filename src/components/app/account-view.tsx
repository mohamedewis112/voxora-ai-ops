"use client";

import { BadgeCheck, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { PageHeader } from "@/components/app/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AccountView() {
  const { t } = useI18n();
  const account = useUiStore((s) => s.account);

  return (
    <div className="space-y-5">
      <PageHeader title={t("account.title")} desc="بيانات حساب العمل وصلاحياته المعتمدة من الإدارة." />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-emerald-500" />
            حساب العمل
          </CardTitle>
          <CardDescription>
            الصلاحيات ثابتة من الإدارة ولا يمكن تغييرها من هذا الحساب.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 p-4">
            <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound className="size-3.5" /> الاسم
            </p>
            <p className="font-medium">{account.name}</p>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="size-3.5" /> البريد الإلكتروني
            </p>
            <p className="break-all font-mono text-sm" dir="ltr">{account.email}</p>
          </div>

          <div className="rounded-xl border border-border/70 p-4 sm:col-span-2">
            <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5" /> الصلاحية
            </p>
            <Badge variant="secondary">
              {account.role === "sales_agent" ? "موظفة مبيعات" : t(`role.${account.role}`)}
            </Badge>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              لا توجد أي أدوات لتغيير الدور أو صلاحيات الإدارة داخل حساب موظف المبيعات.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
