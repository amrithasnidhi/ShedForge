import React from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function FacultyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppShell allowedRoles={["faculty"]}>{children}</AppShell>;
}
