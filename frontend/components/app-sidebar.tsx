"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Calendar,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  GraduationCap,
  Users,
  BookOpen,
  DoorOpen,
  Sliders,
  Sparkles,
  Clock,
  FileText,
  Bell,
  LifeBuoy,
  MessageSquareWarning,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const mainNavItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Programs",
    href: "/programs",
    icon: GraduationCap, // Reusing GraduationCap as it fits 'Programs' well
  },
];

const academicDataItems = [
  {
    title: "Faculty",
    href: "/faculty",
    icon: Users,
  },
  {
    title: "Student List",
    href: "/students",
    icon: Users,
  },
  {
    title: "Courses",
    href: "/courses",
    icon: BookOpen,
  },
  {
    title: "Rooms",
    href: "/rooms",
    icon: DoorOpen,
  },
];

const schedulingItems = [
  {
    title: "Constraints",
    href: "/constraints",
    icon: Sliders,
  },
  {
    title: "Generator",
    href: "/generator",
    icon: Sparkles,
  },
  {
    title: "Schedule",
    href: "/schedule",
    icon: Calendar,
  },
  {
    title: "Conflicts",
    href: "/conflicts",
    icon: AlertTriangle,
  },
  {
    title: "Leave Mgmt",
    href: "/leave-management",
    icon: FileText,
  },
];

const analyticsItems = [
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Versions",
    href: "/versions",
    icon: Calendar,
  },
];

const bottomNavItems = [
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
  {
    title: "Feedback",
    href: "/feedback",
    icon: MessageSquareWarning,
  },
  {
    title: "Issues",
    href: "/issues",
    icon: MessageSquareWarning,
  },
  {
    title: "Help",
    href: "/help",
    icon: LifeBuoy,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

const studentNavItems = [
  {
    title: "Dashboard",
    href: "/student-dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "My Timetable",
    href: "/my-timetable",
    icon: Calendar,
  },
  {
    title: "Issues",
    href: "/issues",
    icon: MessageSquareWarning,
  },
  {
    title: "Feedback",
    href: "/feedback",
    icon: MessageSquareWarning,
  },
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
  {
    title: "Help",
    href: "/help",
    icon: LifeBuoy,
  },
];

const facultyNavItems = [
  {
    title: "Dashboard",
    href: "/faculty-dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "My Schedule",
    href: "/my-schedule",
    icon: Calendar,
  },
  {
    title: "Availability",
    href: "/availability",
    icon: Clock,
  },
  {
    title: "Leave Requests",
    href: "/leaves",
    icon: FileText,
  },
  {
    title: "Issues",
    href: "/issues",
    icon: MessageSquareWarning,
  },
  {
    title: "Feedback",
    href: "/feedback",
    icon: MessageSquareWarning,
  },
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
  {
    title: "Help",
    href: "/help",
    icon: LifeBuoy,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();
  const role = user?.role ?? null;

  const renderNavItems = (items: typeof mainNavItems) => {
    return items.map((item) => (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          isActive={pathname === item.href}
          className="transition-colors"
        >
          <Link href={item.href}>
            <item.icon className="h-5 w-5" />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <GraduationCap className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-sidebar-foreground">
              ShedForge
            </span>
            <span className="text-xs text-sidebar-foreground/70">
              {role === "student"
                ? "Student Portal"
                : role === "faculty"
                  ? "Faculty Portal"
                  : role === "admin" || role === "scheduler"
                    ? "Admin Console"
                    : "Welcome"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {role === "student" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Student Menu
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(studentNavItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {role === "faculty" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Faculty Menu
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(facultyNavItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(role === "admin" || role === "scheduler") && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Main Menu
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderNavItems(mainNavItems)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Academic Data
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderNavItems(academicDataItems)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Scheduling
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderNavItems(schedulingItems)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Reports
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderNavItems(analyticsItems)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {role ? (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              System
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(bottomNavItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm">
              {user?.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col">
            <span className="text-sm font-medium text-sidebar-foreground">
              {user?.name || "Guest"}
            </span>
            <span className="text-xs text-sidebar-foreground/70 capitalize">
              {user?.role || "Visitor"}
            </span>
          </div>
          <button
            onClick={logout}
            disabled={isLoading || !user}
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Log out</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
