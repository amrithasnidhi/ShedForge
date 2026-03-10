"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";
import type { UserRole } from "@/components/auth-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface AppShellProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

export function AppShell({ allowedRoles, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="app-shell-inset">
        <header className="app-shell-header">
          <div className="app-shell-header-row">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex-1" />
            <ThemeToggle />
          </div>
        </header>
        <main className="app-shell-main">
          <div className="app-shell-content">
            <AuthGuard allowedRoles={allowedRoles}>{children}</AuthGuard>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
