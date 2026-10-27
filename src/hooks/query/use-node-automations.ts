import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import type { Backend } from "#/api/backend-registry/types";
import { getRegisteredBackends } from "#/api/backend-registry/active-store";
import type { Automation } from "#/types/automation";
import { AUTOMATIONS_QUERY_KEY } from "./use-automations";
import {
  AUTOMATION_DETAIL_QUERY_KEY,
  AUTOMATION_RUNS_QUERY_KEY,
} from "./use-automation-detail";

export type NodeAutomationAction =
  | { type: "dispatch"; id: string }
  | { type: "update"; id: string; patch: Partial<Automation> };

export function useNodeAutomations(backend: Backend) {
  const client = useQueryClient();
  const queryKey = [
    "all-node-automations",
    backend.id,
    backend.connectionRevision ?? 0,
  ];
  // The revision represents connection changes without putting credentials in keys.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      AutomationService.listAutomations(
        { limit: 50, offset: pageParam },
        backend,
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, offset) => {
      const next = offset + page.automations.length;
      return page.automations.length > 0 && next < page.total
        ? next
        : undefined;
    },
    retry: false,
    refetchInterval: 30_000,
    meta: { disableToast: true },
  });
  const mutation = useMutation({
    mutationFn: async (action: NodeAutomationAction) => {
      const current = getRegisteredBackends().find((b) => b.id === backend.id);
      if (
        current?.host !== backend.host ||
        current.apiKey !== backend.apiKey ||
        current.connectionRevision !== backend.connectionRevision
      )
        throw new Error(
          "Backend connection changed; refresh before trying again",
        );
      if (action.type === "dispatch")
        return AutomationService.dispatchAutomation(action.id, backend);
      return AutomationService.updateAutomation(
        action.id,
        action.patch,
        backend,
      );
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY }),
        client.invalidateQueries({ queryKey: AUTOMATION_DETAIL_QUERY_KEY }),
        client.invalidateQueries({ queryKey: AUTOMATION_RUNS_QUERY_KEY }),
      ]),
    meta: { disableToast: true },
  });
  return { query, mutation };
}
