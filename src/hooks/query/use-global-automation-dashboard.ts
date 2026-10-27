import { useMemo } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import type { Backend } from "#/api/backend-registry/types";
import { getRegisteredBackends } from "#/api/backend-registry/active-store";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import type { Automation } from "#/types/automation";
import type { AutomationDraftApiResponse } from "#/manifests/types";
import {
  AUTOMATIONS_QUERY_KEY,
  AUTOMATION_DRAFTS_QUERY_KEY,
} from "./use-automations";
import {
  AUTOMATION_DETAIL_QUERY_KEY,
  AUTOMATION_RUNS_QUERY_KEY,
} from "./use-automation-detail";
import { uniqueById } from "#/utils/unique-by-id";

const GLOBAL_DASHBOARD_QUERY_KEY = ["global-automation-dashboard"] as const;
export const ALL_AUTOMATION_SERVERS = "all";
export const scopedAutomationId = (backend: Backend, id: string) =>
  JSON.stringify([backend.id, backend.connectionRevision ?? 0, id]);
interface Origin {
  id: string;
  backend: Backend;
}
type GlobalAction = { key: string } & (
  | { type: "dispatch" | "delete" | "deleteDraft" | "dispatchDraft" }
  | { type: "update"; patch: Partial<Automation> }
);

/** Read every page on each node independently; IDs are scoped only in the UI. */
export function useGlobalAutomationDashboard() {
  const { backends, setActive } = useActiveBackendContext();
  const nodes = useMemo(
    () => backends.filter((b) => b.kind === "local"),
    [backends],
  );
  const client = useQueryClient();
  const results = useQueries({
    queries: nodes.map((backend) => ({
      queryKey: [
        ...GLOBAL_DASHBOARD_QUERY_KEY,
        backend.id,
        backend.connectionRevision ?? 0,
      ],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const automations: Automation[] = [];
        let offset = 0;
        do {
          const page = await AutomationService.listAutomations(
            { limit: 100, offset },
            backend,
            signal,
          );
          automations.push(...page.automations);
          offset += page.automations.length;
          if (!page.automations.length || offset >= page.total) break;
        } while (!signal.aborted);
        return uniqueById(automations);
      },
      retry: false,
      refetchInterval: 30_000,
      meta: { disableToast: true },
    })),
  });
  const draftResults = useQueries({
    queries: nodes.map((backend) => ({
      queryKey: [
        ...GLOBAL_DASHBOARD_QUERY_KEY,
        "drafts",
        backend.id,
        backend.connectionRevision ?? 0,
      ],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const drafts: AutomationDraftApiResponse[] = [];
        let offset = 0;
        try {
          do {
            const page = await AutomationService.listServerDrafts(
              { limit: 100, offset },
              backend,
              signal,
            );
            drafts.push(...page.drafts);
            offset += page.drafts.length;
            if (!page.drafts.length || offset >= page.total) break;
          } while (!signal.aborted);
        } catch (error) {
          // Older sidecars do not expose saved drafts; other errors remain visible.
          const status = (error as { response?: { status?: number } }).response
            ?.status;
          if (status !== 404 && status !== 405) throw error;
        }
        return uniqueById(drafts);
      },
      retry: false,
      refetchInterval: 30_000,
      meta: { disableToast: true },
    })),
  });
  const origins = new Map<string, Origin>();
  const automations = nodes.flatMap((backend, index) =>
    (results[index].data ?? []).map((automation) => {
      const key = scopedAutomationId(backend, automation.id);
      origins.set(key, { backend, id: automation.id });
      return { ...automation, id: key };
    }),
  );
  const draftOrigins = new Map<string, Origin>();
  const drafts = nodes.flatMap((backend, index) =>
    (draftResults[index].data ?? []).map((draft) => {
      const key = scopedAutomationId(backend, draft.id);
      draftOrigins.set(key, { backend, id: draft.id });
      return { ...draft, id: key };
    }),
  );
  const mutation = useMutation({
    mutationFn: async (action: GlobalAction) => {
      const origin = (
        action.type === "deleteDraft" || action.type === "dispatchDraft"
          ? draftOrigins
          : origins
      ).get(action.key);
      if (!origin) throw new Error("Automation is no longer available");
      const { id, backend } = origin;
      const current = getRegisteredBackends().find(
        (node) => node.id === backend.id,
      );
      if (
        current?.host !== backend.host ||
        current.apiKey !== backend.apiKey ||
        current.connectionRevision !== backend.connectionRevision
      )
        throw new Error(
          "Backend connection changed; refresh before trying again",
        );
      switch (action.type) {
        case "dispatch":
          return AutomationService.dispatchAutomation(id, backend);
        case "update":
          return AutomationService.updateAutomation(id, action.patch, backend);
        case "delete":
          return AutomationService.deleteAutomation(id, backend);
        case "deleteDraft":
          return AutomationService.deleteServerDraft(id, backend);
        case "dispatchDraft":
          return AutomationService.dispatchServerDraft(id, {}, backend);
      }
    },
    onSuccess: () =>
      Promise.all(
        [
          GLOBAL_DASHBOARD_QUERY_KEY,
          AUTOMATIONS_QUERY_KEY,
          AUTOMATION_DRAFTS_QUERY_KEY,
          AUTOMATION_DETAIL_QUERY_KEY,
          AUTOMATION_RUNS_QUERY_KEY,
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  });
  return {
    nodes,
    origins,
    draftOrigins,
    automations,
    drafts,
    mutation,
    setActive,
    isLoading:
      results.length > 0 && results.every((result) => result.isLoading),
    pendingNodes: nodes.filter(
      (_, index) => results[index].isLoading || draftResults[index].isLoading,
    ),
    failures: nodes.filter(
      (_, index) => results[index].isError || draftResults[index].isError,
    ),
    refetch: () =>
      Promise.all([
        Promise.all(results.map((result) => result.refetch())),
        Promise.all(draftResults.map((result) => result.refetch())),
      ]),
  };
}
export type GlobalAutomationDashboard = ReturnType<
  typeof useGlobalAutomationDashboard
>;
