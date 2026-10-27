import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRegisteredBackends } from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import SharedAutomationSectionsService, {
  sharedAutomationSectionsOwner,
  sharedAutomationAssignmentId,
} from "#/api/shared-automation-sections-service";
import type { AutomationSectionCommand } from "#/utils/automation-sections";
import type { GlobalAutomationDashboard } from "./use-global-automation-dashboard";

const SHARED_SECTIONS_QUERY_KEY = ["shared-automation-sections"] as const;

function assertCurrent(backend: Backend) {
  const current = getRegisteredBackends().find(
    (node) => node.id === backend.id,
  );
  if (
    current?.host !== backend.host ||
    current.apiKey !== backend.apiKey ||
    current.connectionRevision !== backend.connectionRevision
  )
    throw new Error("Backend connection changed; refresh before trying again");
}

export function useSharedAutomationSections(global: GlobalAutomationDashboard) {
  const { nodes, origins } = global;
  const owner = sharedAutomationSectionsOwner(nodes);
  const client = useQueryClient();
  // No credentials in keys; revisions invalidate reads when credentials change.
  const queryKey = [
    ...SHARED_SECTIONS_QUERY_KEY,
    owner?.id,
    nodes.map((node) => [node.id, node.connectionRevision ?? 0]),
  ];
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useQuery({
    queryKey,
    queryFn: () => SharedAutomationSectionsService.read(owner!, nodes),
    enabled: !!owner,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    meta: { disableToast: true },
  });
  const mutation = useMutation({
    mutationFn: (command: AutomationSectionCommand) => {
      if (!owner) throw new Error("No section storage backend");
      assertCurrent(owner);
      let edit = command;
      if (command.type === "assign") {
        const origin = origins.get(command.automationId);
        if (!origin) throw new Error("Automation is no longer available");
        assertCurrent(origin.backend);
        edit = {
          ...command,
          automationId: sharedAutomationAssignmentId(origin.backend, origin.id),
        };
      }
      return SharedAutomationSectionsService.update(owner, nodes, edit);
    },
    scope: { id: `${SHARED_SECTIONS_QUERY_KEY[0]}:${owner?.id}` },
    onMutate: async () => {
      await client.cancelQueries({ queryKey });
      return { queryKey };
    },
    onSuccess: (state, _command, context) =>
      client.setQueryData(context.queryKey, state),
    onSettled: () =>
      client.invalidateQueries({ queryKey: SHARED_SECTIONS_QUERY_KEY }),
    meta: { disableToast: true },
  });
  return {
    scopeKey: `${owner?.id}:${owner?.connectionRevision ?? 0}`,
    data: query.data && {
      ...query.data,
      assignments: Object.fromEntries(
        [...origins].map(([key, origin]) => [
          key,
          query.data.assignments[
            sharedAutomationAssignmentId(origin.backend, origin.id)
          ] ?? null,
        ]),
      ),
    },
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    supported: !!owner,
    mutation,
  };
}
