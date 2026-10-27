import { useNavigation } from "#/context/navigation-context";
import { withBackendSelectionParams } from "#/api/backend-registry/url-selection";
import { automationDetailPath } from "#/manifests/automation-interface";
import {
  ALL_AUTOMATION_SERVERS,
  type GlobalAutomationDashboard,
} from "#/hooks/query/use-global-automation-dashboard";
import { useSharedAutomationSections } from "#/hooks/query/use-shared-automation-sections";
import { AutomationSectionsPanel } from "./automation-sections";
import type { AutomationGroupProps } from "./automation-group";

type Props = Omit<AutomationGroupProps, "title" | "count"> & {
  global: GlobalAutomationDashboard;
  server: string;
  filtered: boolean;
};

export function GlobalAutomationSections({
  global,
  server,
  filtered,
  ...props
}: Props) {
  const { navigate } = useNavigation();
  const query = useSharedAutomationSections(global);
  const href = (key: string, runId?: string) => {
    const origin = global.origins.get(key)!;
    return withBackendSelectionParams(
      `${automationDetailPath(origin.id)}${runId ? `?run=${encodeURIComponent(runId)}` : ""}`,
      { backend: origin.backend, orgId: null },
    );
  };
  return (
    <AutomationSectionsPanel
      {...props}
      key={query.scopeKey}
      showWhileLoading
      automations={props.automations.filter(
        (row) =>
          server === ALL_AUTOMATION_SERVERS ||
          global.origins.get(row.id)?.backend.id === server,
      )}
      query={query}
      filtered={filtered || server !== ALL_AUTOMATION_SERVERS}
      serverName={(id) => global.origins.get(id)?.backend.name}
      onExport={(automation) =>
        props.onExport({
          ...automation,
          id: global.origins.get(automation.id)!.id,
        })
      }
      navigation={{
        href,
        open: (key, runId) => {
          global.setActive(global.origins.get(key)!.backend.id);
          navigate(href(key, runId));
        },
      }}
    />
  );
}
