import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";

const FIELD_ID = {
  name: "name",
  source: "source",
  event: "event",
  filter: "filter",
  schedule: "schedule",
  timezone: "timezone",
} as const;

interface Props {
  automation: Automation;
  backendName: string;
  busy: boolean;
  error: string | null;
  onSave: (patch: Partial<Automation>) => void;
  onClose: () => void;
}

export function NodeAutomationEditor({
  automation,
  backendName,
  busy,
  error,
  onSave,
  onClose,
}: Props) {
  const { t } = useTranslation("openhands");
  const fieldId = useId();
  const [name, setName] = useState(automation.name);
  const [prompt, setPrompt] = useState(automation.prompt ?? "");
  const [schedule, setSchedule] = useState(automation.trigger.schedule ?? "");
  const [timezone, setTimezone] = useState(automation.trigger.timezone ?? "");
  const [source, setSource] = useState(automation.trigger.source ?? "");
  const initialEvent = Array.isArray(automation.trigger.on)
    ? automation.trigger.on.join(",")
    : (automation.trigger.on ?? "");
  const [event, setEvent] = useState(initialEvent);
  const [filter, setFilter] = useState(automation.trigger.filter ?? "");
  const isEvent = automation.trigger.type === "event";
  const field = (
    key: string,
    label: string,
    value: string,
    update: (value: string) => void,
    required = false,
  ) => (
    <label
      className="flex flex-col gap-2 text-sm"
      htmlFor={`${fieldId}-${key}`}
    >
      {label}
      <input
        id={`${fieldId}-${key}`}
        className={formControlFieldClassName}
        value={value}
        onChange={(e) => update(e.target.value)}
        disabled={busy}
        required={required}
      />
    </label>
  );
  return (
    <ModalBackdrop
      aria-label={`${t(I18nKey.AUTOMATIONS$EDIT)} · ${backendName}`}
      onClose={onClose}
      closeOnEscape={!busy}
      closeOnBackdropClick={!busy}
    >
      <form
        className={cn(
          "flex max-h-dvh flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-foreground",
          modalWidthClassName("md"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !name.trim()) return;
          const patch: Partial<Automation> = {};
          if (name.trim() !== automation.name) patch.name = name.trim();
          if (automation.prompt !== null && prompt !== automation.prompt)
            patch.prompt = prompt;
          const trigger = { ...automation.trigger };
          if (isEvent) {
            if (source !== (trigger.source ?? "")) trigger.source = source;
            if (event !== initialEvent)
              trigger.on = Array.isArray(automation.trigger.on)
                ? event
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : event;
            if (filter !== (trigger.filter ?? "")) trigger.filter = filter;
          } else {
            if (schedule !== (trigger.schedule ?? ""))
              trigger.schedule = schedule;
            if (timezone !== (trigger.timezone ?? ""))
              trigger.timezone = timezone;
          }
          if (JSON.stringify(trigger) !== JSON.stringify(automation.trigger))
            patch.trigger = trigger;
          onSave(patch);
        }}
      >
        <div>
          <h2 className="text-lg font-medium">{t(I18nKey.AUTOMATIONS$EDIT)}</h2>
          <p className="text-sm text-muted">
            {backendName} · {automation.name}
          </p>
        </div>
        {field(FIELD_ID.name, t(I18nKey.AUTOMATIONS$NAME), name, setName, true)}
        {automation.prompt !== null && (
          <label
            className="flex flex-col gap-2 text-sm"
            htmlFor={`${fieldId}-prompt`}
          >
            {t(I18nKey.AUTOMATIONS$PROMPT)}
            <textarea
              id={`${fieldId}-prompt`}
              rows={6}
              className={formControlFieldClassName}
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
        )}
        {isEvent ? (
          <>
            {field(
              FIELD_ID.source,
              t(I18nKey.AUTOMATIONS$DETAIL$EVENT_SOURCE),
              source,
              setSource,
              true,
            )}
            {field(
              FIELD_ID.event,
              t(I18nKey.AUTOMATIONS$DETAIL$EVENT_TYPE),
              event,
              setEvent,
              true,
            )}
            {field(
              FIELD_ID.filter,
              t(I18nKey.AUTOMATIONS$DETAIL$EVENT_FILTER),
              filter,
              setFilter,
            )}
          </>
        ) : (
          <>
            {field(
              FIELD_ID.schedule,
              t(I18nKey.AUTOMATIONS$DETAIL$SCHEDULE),
              schedule,
              setSchedule,
              true,
            )}
            {field(
              FIELD_ID.timezone,
              t(I18nKey.AUTOMATIONS$TIMEZONE),
              timezone,
              setTimezone,
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-feedback-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <BrandButton
              type="button"
              variant="secondary"
              onClick={onClose}
              isDisabled={busy}
            >
              {t(I18nKey.AUTOMATIONS$CANCEL)}
            </BrandButton>
            <BrandButton
              type="submit"
              variant="primary"
              isDisabled={busy || !name.trim()}
              aria-busy={busy}
            >
              {t(I18nKey.AUTOMATIONS$SAVE)}
            </BrandButton>
          </div>
        </div>
      </form>
    </ModalBackdrop>
  );
}
