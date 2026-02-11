import React from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthGuard } from "@/components/auth-guard";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

export default function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
                    <SidebarTrigger className="-ml-2" />
                    <Separator orientation="vertical" className="h-6" />
                    <div className="flex-1" />
                    <ThemeToggle />
                </header>
                <main className="flex-1 p-6">
                    <AuthGuard allowedRoles={["student"]}>{children}</AuthGuard>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
