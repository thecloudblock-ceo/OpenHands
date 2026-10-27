/** A dashboard row carries its owning server into detail and run links. */
export interface AutomationNavigation {
  href: (id: string, runId?: string) => string;
  open: (id: string, runId?: string) => void;
}
