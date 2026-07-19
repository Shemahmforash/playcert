import type { ReactNode } from "react";

/**
 * AppShell — the poster column.
 *
 * A centered, single-column layout wrapper: the continuous perforated "bill" the
 * whole product scrolls inside. Minimal by design — the masthead and the
 * EarshotDial land in later Phase 2 tasks; this just establishes the column
 * width, gutters, and full-height ground.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col px-4 sm:px-6">
      {children}
    </div>
  );
}
