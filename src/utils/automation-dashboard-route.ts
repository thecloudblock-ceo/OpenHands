/** The per-server dashboard retains sections, drafts and overview controls. */
export const AUTOMATIONS_DASHBOARD_PATH = "/automations";
export const AUTOMATIONS_SERVER_DASHBOARD_PATH = "/automations?view=server";

export function isAllAutomationsLocation(pathname: string, search: string) {
  const path = pathname.replace(/\/$/, "");
  return (
    path === "/automations/all" ||
    (path === AUTOMATIONS_DASHBOARD_PATH &&
      new URLSearchParams(search).get("view") !== "server")
  );
}
