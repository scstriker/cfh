"use client";

import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAppContext } from "@/store/AppContext";

const phaseByPath = {
  "/phase0": "phase0",
  "/phase1": "phase1",
  "/phase2": "phase2",
  "/phase3": "phase3",
  "/phase4": "phase4"
} as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { dispatch } = useAppContext();

  useEffect(() => {
    const phase = phaseByPath[pathname as keyof typeof phaseByPath];
    if (phase) {
      dispatch({ type: "SET_CURRENT_PHASE", payload: phase });
    }
  }, [pathname, dispatch]);

  return (
    <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
      <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <Sidebar />
      </div>
      <div className="space-y-4">
        <Header pathname={pathname} />
        <main className="rounded-xl bg-cfh-panel p-4 shadow-panel">{children}</main>
      </div>
    </div>
  );
}
