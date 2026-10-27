import { useGlobalAutomationDashboard } from "#/hooks/query/use-global-automation-dashboard";
import AutomationsList from "./automations-list";

/** The original dashboard presentation, with explicitly scoped server data. */
export default function GlobalAutomationsDashboard() {
  const global = useGlobalAutomationDashboard();
  return <AutomationsList global={global} />;
}
