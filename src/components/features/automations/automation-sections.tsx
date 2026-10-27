import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAutomationSections } from "#/hooks/query/use-automation-sections";
import { useAutomationPermissions } from "#/hooks/use-automation-permissions";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";
import {
  AUTOMATION_SECTION_NAME_MAX_LENGTH,
  AutomationSectionsError,
  getAutomationSectionId,
  normalizeSectionName,
  type AutomationSectionCommand,
} from "#/utils/automation-sections";
import { AutomationGroup, type AutomationGroupProps } from "./automation-group";
import { DeleteConfirmationModal } from "./delete-confirmation-modal";
import { StatusBadge } from "./status-badge";
import { AutomationCardSkeleton } from "./automation-card-skeleton";
import { automationIconActionButtonClassName } from "./automation-action-button-classes";

const UNASSIGNED_GROUP_ID = "unassigned";

type SectionDialog =
  | { type: "create"; id: string; name: string }
  | { type: "rename"; id: string; name: string }
  | { type: "delete"; id: string; name: string }
  | {
      type: "assign";
      automationId: string;
      name: string;
      sectionId: string | null;
    };

type Props = Omit<
  AutomationGroupProps,
  "title" | "count" | "hideHeading" | "onMove"
> & { filtered?: boolean };

/** One controller owns the dialogs; the query cache owns all persisted state. */
export function AutomationSections({
  automations,
  filtered = false,
  ...groupProps
}: Props) {
  const { t } = useTranslation("openhands");
  const query = useAutomationSections();
  const { canManage } = useAutomationPermissions();
  const [dialog, setDialog] = useState<SectionDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = query.data;
  const busy = query.mutation.isPending;
  const ready = query.supported && query.isSuccess && !query.isError && !busy;
  const sections = Object.entries(state?.sections ?? {})
    .filter(([, section]) => !section.deleted)
    .sort(
      ([aId, a], [bId, b]) =>
        a.createdAt - b.createdAt || aId.localeCompare(bId),
    );

  const close = () => {
    if (!busy) {
      setDialog(null);
      setError(null);
    }
  };
  const open = (next: SectionDialog) => {
    setError(null);
    setDialog(next);
  };
  const save = async (command: AutomationSectionCommand, closeAfter = true) => {
    setError(null);
    try {
      await query.mutation.mutateAsync(command);
      if (closeAfter) setDialog(null);
    } catch (cause) {
      const key =
        cause instanceof AutomationSectionsError && cause.code === "duplicate"
          ? I18nKey.AUTOMATIONS$SECTION_DUPLICATE
          : I18nKey.AUTOMATIONS$SECTION_SAVE_ERROR;
      setError(t(key));
    }
  };

  const fallback = (
    <>
      {[true, false].map((enabled) => {
        const rows = automations.filter((a) => a.enabled === enabled);
        return (
          <AutomationGroup
            key={String(enabled)}
            {...groupProps}
            title={t(
              enabled
                ? I18nKey.AUTOMATIONS$ACTIVE
                : I18nKey.AUTOMATIONS$INACTIVE,
            )}
            count={rows.length}
            automations={rows}
          />
        );
      })}
    </>
  );
  if (!query.supported) return fallback;

  const groups = state
    ? [
        ...sections.map(([id, section]) => ({
          id,
          name: section.name,
          collapsed: section.collapsed,
        })),
        {
          id: null,
          name: t(I18nKey.AUTOMATIONS$UNASSIGNED_SECTION),
          collapsed: state.unassignedCollapsed,
        },
      ]
    : [];
  const dialogTitle =
    dialog?.type === "assign"
      ? t(I18nKey.AUTOMATIONS$MOVE_TO_SECTION)
      : dialog?.type === "rename"
        ? t(I18nKey.AUTOMATIONS$RENAME_SECTION)
        : t(I18nKey.AUTOMATIONS$CREATE_SECTION);

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <div className="flex justify-end">
          <BrandButton
            type="button"
            variant="secondary"
            isDisabled={!ready}
            onClick={() =>
              open({ type: "create", id: crypto.randomUUID(), name: "" })
            }
            startContent={<FolderPlus className="size-4" aria-hidden />}
          >
            {t(I18nKey.AUTOMATIONS$CREATE_SECTION)}
          </BrandButton>
        </div>
      )}
      {query.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-feedback-error"
        >
          <span>{t(I18nKey.AUTOMATIONS$SECTION_LOAD_ERROR)}</span>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {t(I18nKey.AUTOMATIONS$ERROR_RETRY)}
          </BrandButton>
        </div>
      )}
      {error && !dialog && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      {!state ? (
        query.isError ? (
          fallback
        ) : (
          <AutomationCardSkeleton />
        )
      ) : (
        groups.map((group) => {
          const rows = automations.filter(
            (a) => getAutomationSectionId(state, a.id) === group.id,
          );
          if (filtered && rows.length === 0) return null;
          const expanded = filtered || !group.collapsed;
          const panelId = `automation-section-${group.id ?? UNASSIGNED_GROUP_ID}`;
          return (
            <section
              key={group.id ?? UNASSIGNED_GROUP_ID}
              aria-label={group.name}
            >
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 flex-1 text-base font-semibold text-foreground">
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-2 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    disabled={!ready || filtered}
                    onClick={() => {
                      void save(
                        {
                          type: "collapse",
                          id: group.id,
                          collapsed: !group.collapsed,
                        },
                        false,
                      );
                    }}
                  >
                    {expanded ? (
                      <ChevronDown className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="break-words">{group.name}</span>
                    <StatusBadge count={rows.length} />
                  </button>
                </h2>
                {canManage && group.id !== null && (
                  <>
                    <button
                      type="button"
                      className={automationIconActionButtonClassName}
                      disabled={!ready}
                      aria-label={t(I18nKey.AUTOMATIONS$RENAME_SECTION_NAME, {
                        name: group.name,
                      })}
                      onClick={() =>
                        open({
                          type: "rename",
                          id: group.id!,
                          name: group.name,
                        })
                      }
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={automationIconActionButtonClassName}
                      disabled={!ready}
                      aria-label={t(I18nKey.AUTOMATIONS$DELETE_SECTION_NAME, {
                        name: group.name,
                      })}
                      onClick={() =>
                        open({
                          type: "delete",
                          id: group.id!,
                          name: group.name,
                        })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>
              <div id={panelId} hidden={!expanded}>
                {rows.length ? (
                  <AutomationGroup
                    {...groupProps}
                    title={group.name}
                    count={rows.length}
                    automations={rows}
                    hideHeading
                    onMove={
                      canManage && ready
                        ? (automationId) => {
                            const automation = automations.find(
                              (a) => a.id === automationId,
                            );
                            if (automation)
                              open({
                                type: "assign",
                                automationId,
                                name: automation.name,
                                sectionId: getAutomationSectionId(
                                  state,
                                  automationId,
                                ),
                              });
                          }
                        : undefined
                    }
                  />
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    {t(I18nKey.AUTOMATIONS$SECTION_EMPTY)}
                  </p>
                )}
              </div>
            </section>
          );
        })
      )}
      {dialog && dialog.type !== "delete" && (
        <ModalBackdrop
          aria-label={dialogTitle}
          onClose={close}
          closeOnEscape={!busy}
          closeOnBackdropClick={!busy}
        >
          <form
            className={cn(
              "rounded-xl border border-border bg-surface p-6",
              modalWidthClassName("sm"),
              MODAL_MAX_WIDTH_VIEWPORT,
            )}
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) void save(dialog);
            }}
          >
            <h2 className="text-lg font-medium text-foreground">
              {dialogTitle}
            </h2>
            {dialog.type === "assign" ? (
              <>
                <p className="mt-2 break-words text-sm text-muted">
                  {dialog.name}
                </p>
                <label
                  className="mt-4 block text-sm text-foreground"
                  htmlFor="automation-section-choice"
                >
                  {t(I18nKey.AUTOMATIONS$SECTION_LABEL)}
                </label>
                <select
                  id="automation-section-choice"
                  className={cn(formControlFieldClassName, "mt-2")}
                  disabled={!ready}
                  value={dialog.sectionId ?? ""}
                  onChange={(event) =>
                    setDialog({
                      ...dialog,
                      sectionId: event.target.value || null,
                    })
                  }
                >
                  <option value="">
                    {t(I18nKey.AUTOMATIONS$UNASSIGNED_SECTION)}
                  </option>
                  {sections.map(([id, section]) => (
                    <option key={id} value={id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label
                  className="mt-4 block text-sm text-foreground"
                  htmlFor="automation-section-name"
                >
                  {t(I18nKey.AUTOMATIONS$SECTION_NAME)}
                </label>
                <input
                  id="automation-section-name"
                  className={cn(formControlFieldClassName, "mt-2")}
                  required
                  maxLength={AUTOMATION_SECTION_NAME_MAX_LENGTH}
                  value={dialog.name}
                  disabled={!ready}
                  onChange={(event) =>
                    setDialog({ ...dialog, name: event.target.value })
                  }
                />
              </>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-feedback-error">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <BrandButton
                type="button"
                variant="secondary"
                isDisabled={busy}
                onClick={close}
              >
                {t(I18nKey.AUTOMATIONS$CANCEL)}
              </BrandButton>
              <BrandButton
                type="submit"
                variant="primary"
                isDisabled={
                  !ready ||
                  (dialog.type !== "assign" &&
                    !normalizeSectionName(dialog.name))
                }
                aria-busy={busy}
              >
                {t(I18nKey.AUTOMATIONS$SAVE)}
              </BrandButton>
            </div>
          </form>
        </ModalBackdrop>
      )}
      {dialog?.type === "delete" && (
        <>
          <DeleteConfirmationModal
            automationName={dialog.name}
            isOpen
            title={t(I18nKey.AUTOMATIONS$DELETE_SECTION)}
            message={t(I18nKey.AUTOMATIONS$DELETE_SECTION_MESSAGE, {
              name: dialog.name,
            })}
            error={error ?? undefined}
            onCancel={close}
            onConfirm={() => {
              if (ready) void save(dialog);
            }}
            isConfirming={!ready}
          />
        </>
      )}
    </div>
  );
}
