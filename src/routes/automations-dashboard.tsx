import { useLocation } from "react-router";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { isAllAutomationsLocation } from "#/utils/automation-dashboard-route";
import AutomationsList from "./automations-list";
import GlobalAutomationsDashboard from "./global-automations-dashboard";

export { clientLoader } from "./automations-list";

export default function AutomationsDashboard() {
  const { backend } = useActiveBackend();
  const location = useLocation();
  if (
    backend.kind === "local" &&
    isAllAutomationsLocation(location.pathname, location.search)
  ) {
    return <GlobalAutomationsDashboard />;
  }
  return <AutomationsList />;
}
