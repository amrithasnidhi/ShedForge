"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth, type UserRole } from "@/components/auth-provider";

function getHomePath(role: UserRole | null | undefined): string {
  if (role === "student") {
    return "/student-dashboard";
  }
  if (role === "faculty") {
    return "/faculty-dashboard";
  }
  return "/dashboard";
}

export function AuthGuard({
  allowedRoles,
  children,
}: {
  allowedRoles?: UserRole[];
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/");
      return;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.replace(getHomePath(user.role));
    }
  }, [allowedRoles, isAuthenticated, isLoading, router, user]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking access...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Redirecting to your dashboard...
      </div>
    );
  }

  return <>{children}</>;
}
