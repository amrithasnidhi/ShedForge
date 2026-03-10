import React from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell allowedRoles={["admin", "scheduler", "faculty", "student"]}>{children}</AppShell>;
}
