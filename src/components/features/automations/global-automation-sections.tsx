import { useNavigation } from "#/context/navigation-context";
import { withBackendSelectionParams } from "#/api/backend-registry/url-selection";
import { automationDetailPath } from "#/manifests/automation-interface";
import {
  ALL_AUTOMATION_SERVERS,
  scopedAutomationId,
  type GlobalAutomationDashboard,
} from "#/hooks/query/use-global-automation-dashboard";
import { AutomationSections } from "./automation-sections";
import type { AutomationGroupProps } from "./automation-group";

type Props = Omit<AutomationGroupProps, "title" | "count"> & {
  global: GlobalAutomationDashboard;
  server: string;
  filtered: boolean;
};

export function GlobalAutomationSections({
  global,
  server,
  automations,
  insights,
  runPendingId,
  onToggle,
  onRunNow,
  onDelete,
  onEdit,
  ...props
}: Props) {
  const { navigate } = useNavigation();
  return global.nodes
    .filter((node) => server === ALL_AUTOMATION_SERVERS || node.id === server)
    .map((backend) => {
      const rows = automations.filter(
        (row) => global.origins.get(row.id)?.backend.id === backend.id,
      );
      const nativeRows = rows.map((row) => ({
        ...row,
        id: global.origins.get(row.id)!.id,
      }));
      const keyFor = (id: string) => scopedAutomationId(backend, id);
      const href = (id: string, runId?: string) =>
        withBackendSelectionParams(
          `${automationDetailPath(id)}${runId ? `?run=${encodeURIComponent(runId)}` : ""}`,
          {
            backend,
            orgId: null,
          },
        );
      return (
        <section
          key={`${backend.id}:${backend.connectionRevision ?? 0}`}
          aria-label={backend.name}
          className="flex flex-col gap-3"
        >
          <h2 className="text-sm font-medium text-muted">{backend.name}</h2>
          <AutomationSections
            {...props}
            backend={backend}
            serverName={backend.name}
            automations={nativeRows}
            navigation={{
              href,
              open: (id, runId) => {
                global.setActive(backend.id);
                navigate(href(id, runId));
              },
            }}
            insights={
              insights && {
                spec: insights.spec,
                byId: new Map(
                  nativeRows.map((row) => [
                    row.id,
                    insights.byId.get(keyFor(row.id))!,
                  ]),
                ),
              }
            }
            runPendingId={
              nativeRows.find((row) => keyFor(row.id) === runPendingId)?.id
            }
            onToggle={(id, enabled) => onToggle(keyFor(id), enabled)}
            onRunNow={(id) => onRunNow(keyFor(id))}
            onDelete={(id) => onDelete(keyFor(id))}
            onEdit={onEdit && ((id) => onEdit(keyFor(id)))}
          />
        </section>
      );
    });
}
