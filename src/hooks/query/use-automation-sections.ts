import type { Backend } from "#/api/backend-registry/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AutomationSectionsService from "#/api/automation-sections-service";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AUTOMATION_SECTIONS_QUERY_KEYS } from "#/hooks/query/query-keys";
import type { AutomationSectionCommand } from "#/utils/automation-sections";

export function useAutomationSections(target?: Backend) {
  const active = useActiveBackend();
  const backend = target ?? active.backend;
  const client = useQueryClient();
  const supported = backend.kind === "local" && !isNoBackend(backend);
  const queryKey = AUTOMATION_SECTIONS_QUERY_KEYS.byBackend(
    backend.id,
    backend.connectionRevision ?? 0,
  );
  // Credentials stay out of query keys; connectionRevision changes with host/key.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useQuery({
    queryKey,
    queryFn: () => AutomationSectionsService.read(backend),
    enabled: supported,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    meta: { disableToast: true },
  });
  const mutation = useMutation({
    mutationFn: (command: AutomationSectionCommand) =>
      AutomationSectionsService.update(backend, command),
    // Serialize same-backend changes made through multiple mounted consumers.
    scope: { id: queryKey.join(":") },
    onMutate: async () => {
      await client.cancelQueries({ queryKey });
      return { queryKey };
    },
    onSuccess: (state, _command, context) =>
      client.setQueryData(context.queryKey, state),
    onSettled: (_data, _error, _command, context) =>
      client.invalidateQueries({ queryKey: context?.queryKey ?? queryKey }),
    meta: { disableToast: true },
  });
  return {
    data: query.data,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    supported,
    mutation,
  };
}
