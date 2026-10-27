import { Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

export function AutomationServerBadge({ name }: { name: string }) {
  const { t } = useTranslation("openhands");
  return (
    <span
      aria-label={t(I18nKey.AUTOMATIONS$SERVER_BADGE, { server: name })}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-0.5 text-xs font-normal text-muted"
    >
      <Server className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
