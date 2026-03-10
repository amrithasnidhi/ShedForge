import React from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppShell allowedRoles={["student"]}>{children}</AppShell>;
}
