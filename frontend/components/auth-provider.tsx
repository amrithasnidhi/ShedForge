"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export type UserRole = "admin" | "scheduler" | "faculty" | "student" | null;

interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    department?: string;
}

interface AuthContextType {
    user: User | null;
    login: (role: UserRole, email?: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();

    useEffect(() => {
        // Check local storage for persisted session
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const login = (role: UserRole, email: string = "") => {
        let mockUser: User = {
            id: "1",
            name: "Admin User",
            email: email || "admin@university.edu",
            role: role,
        };

        if (role === "scheduler") {
            mockUser = {
                id: "2",
                name: "Scheduler User",
                email: email || "scheduler@university.edu",
                role: "scheduler",
            };
        } else if (role === "faculty") {
            mockUser = {
                id: "f1",
                name: "Dr. Sarah Wilson",
                email: email || "sarah.wilson@university.edu",
                role: "faculty",
                department: "Computer Science",
            };
        } else if (role === "student") {
            mockUser = {
                id: "s1",
                name: "Alex Johnson",
                email: email || "alex.j@student.university.edu",
                role: "student",
                department: "Computer Science",
            };
        }

        setUser(mockUser);
        localStorage.setItem("user", JSON.stringify(mockUser));

        // Redirect based on role
        if (role === "student") {
            router.push("/student-dashboard");
        } else if (role === "faculty") {
            router.push("/faculty-dashboard");
        } else {
            router.push("/dashboard");
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("user");
        router.push("/");
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
