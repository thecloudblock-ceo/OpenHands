import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Backend } from "#/api/backend-registry/types";
import type { Automation } from "#/types/automation";
import {
  useNodeAutomations,
  type NodeAutomationAction,
} from "#/hooks/query/use-node-automations";
import { BrandButton } from "#/components/features/settings/brand-button";
import { getApiErrorMessage } from "#/utils/api-error-message";
import {
  isDraftAutomation,
  getAutomationLifecycleState,
} from "#/utils/automation-state";
import { uniqueById } from "#/utils/unique-by-id";
import { matchesAutomationSearch } from "#/manifests/automation-insights";
import { NodeAutomationEditor } from "./node-automation-editor";

/** Each node owns its query, failures and pending actions independently. */
export function NodeAutomations({
  backend,
  search,
}: {
  backend: Backend;
  search: string;
}) {
  const { t } = useTranslation("openhands");
  const headingId = useId();
  const { query, mutation } = useNodeAutomations(backend);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const automations = uniqueById(
    query.data?.pages.flatMap((page) => page.automations) ?? [],
  ).filter((a) => !isDraftAutomation(a));
  const visible = automations.filter(
    (a) =>
      backend.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) ||
      matchesAutomationSearch(a, search),
  );
  const error = mutation.error
    ? getApiErrorMessage(mutation.error, t(I18nKey.ERROR$GENERIC))
    : null;
  const act = (action: NodeAutomationAction) => {
    setMessage(null);
    mutation.mutate(action, {
      onSuccess: () => {
        setMessage(
          t(
            action.type === "dispatch"
              ? I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS
              : I18nKey.AUTOMATIONS$EDIT_SUCCESS,
          ),
        );
        if (action.type === "update") setEditing(null);
      },
    });
  };
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        {backend.name}
      </h2>
      {query.isPending && (
        <p role="status" className="text-sm text-muted">
          {t(I18nKey.HOME$LOADING)}
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-danger"
        >
          <p>{t(I18nKey.AUTOMATIONS$NODE_UNAVAILABLE)}</p>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={() => {
              void query.refetch();
            }}
            isDisabled={query.isFetching}
          >
            {t(I18nKey.AUTOMATIONS$ERROR_RETRY)}
          </BrandButton>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
      {error && !editing && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {query.isSuccess && visible.length === 0 && (
        <p className="text-sm text-muted">
          {t(
            search
              ? I18nKey.AUTOMATIONS$NO_FILTER_MATCHES
              : I18nKey.AUTOMATIONS$EMPTY,
          )}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border">
        {visible.map((automation) => (
          <li
            key={automation.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-sm font-medium text-foreground">
                {automation.name}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {t(
                  getAutomationLifecycleState(automation) === "active"
                    ? I18nKey.AUTOMATIONS$ACTIVE
                    : I18nKey.AUTOMATIONS$INACTIVE,
                )}{" "}
                ·{" "}
                {automation.trigger.schedule_human ??
                  automation.trigger.schedule ??
                  automation.trigger.source}
                {automation.trigger.timezone
                  ? ` · ${automation.trigger.timezone}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrandButton
                type="button"
                variant="secondary"
                isDisabled={mutation.isPending || query.isError}
                onClick={() => act({ type: "dispatch", id: automation.id })}
              >
                {t(I18nKey.AUTOMATIONS$RUN_NOW)}
              </BrandButton>
              <BrandButton
                type="button"
                variant="secondary"
                isDisabled={mutation.isPending || query.isError}
                onClick={() =>
                  act({
                    type: "update",
                    id: automation.id,
                    patch: {
                      enabled:
                        getAutomationLifecycleState(automation) !== "active",
                    },
                  })
                }
              >
                {t(
                  getAutomationLifecycleState(automation) === "active"
                    ? I18nKey.AUTOMATIONS$TURN_OFF
                    : I18nKey.AUTOMATIONS$TURN_ON,
                )}
              </BrandButton>
              <BrandButton
                type="button"
                variant="tertiary"
                isDisabled={mutation.isPending || query.isError}
                onClick={() => {
                  mutation.reset();
                  setMessage(null);
                  setEditing(automation);
                }}
              >
                {t(I18nKey.AUTOMATIONS$EDIT)}
              </BrandButton>
            </div>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <BrandButton
          type="button"
          variant="secondary"
          isDisabled={query.isFetching}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          {t(I18nKey.AUTOMATIONS$LOAD_MORE)}
        </BrandButton>
      )}
      {editing && (
        <NodeAutomationEditor
          key={editing.id}
          automation={editing}
          backendName={backend.name}
          busy={mutation.isPending}
          error={error}
          onClose={() => {
            if (!mutation.isPending) setEditing(null);
          }}
          onSave={(patch) => {
            if (Object.keys(patch).length === 0) setEditing(null);
            else act({ type: "update", id: editing.id, patch });
          }}
        />
      )}
    </section>
  );
}
