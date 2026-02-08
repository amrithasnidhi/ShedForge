"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type UserRole = "admin" | "scheduler" | "faculty" | "student" | null;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES ?? "30");
const IDLE_TIMEOUT_MS = Number.isFinite(IDLE_MINUTES) && IDLE_MINUTES > 0
    ? IDLE_MINUTES * 60 * 1000
    : 30 * 60 * 1000;

function getTokenExpiry(token: string): number | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) {
            return null;
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const decoded = JSON.parse(atob(padded));
        if (typeof decoded.exp !== "number") {
            return null;
        }
        return decoded.exp * 1000;
    } catch {
        return null;
    }
}

function markActivity() {
    if (typeof window === "undefined") {
        return;
    }
    localStorage.setItem("lastActivity", String(Date.now()));
}

interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    department?: string;
    section_name?: string | null;
}

interface LoginCredentials {
    role: Exclude<UserRole, null>;
    email: string;
    password: string;
}

interface LoginOtpChallenge {
    challenge_id: string;
    email: string;
    expires_in_seconds: number;
    message: string;
    otp_hint?: string | null;
}

interface RegisterPayload extends LoginCredentials {
    name: string;
    department?: string;
    section_name?: string;
    preferred_subject_codes?: string[];
}

interface AuthContextType {
    user: User | null;
    login: (credentials: LoginCredentials) => Promise<void>;
    requestLoginOtp: (credentials: LoginCredentials) => Promise<LoginOtpChallenge>;
    verifyLoginOtp: (challengeId: string, otpCode: string) => Promise<void>;
    register: (payload: RegisterPayload) => Promise<void>;
    requestPasswordReset: (email: string) => Promise<{ resetToken?: string }>;
    confirmPasswordReset: (token: string, newPassword: string) => Promise<void>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const expiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearTimers = () => {
        if (expiryTimeoutRef.current) {
            clearTimeout(expiryTimeoutRef.current);
            expiryTimeoutRef.current = null;
        }
        if (idleIntervalRef.current) {
            clearInterval(idleIntervalRef.current);
            idleIntervalRef.current = null;
        }
    };

    const performLogout = (redirect: boolean = true) => {
        clearTimers();
        setUser(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        localStorage.removeItem("lastActivity");
        if (redirect) {
            router.push("/");
        }
    };

    const scheduleSessionTimers = (token: string) => {
        clearTimers();
        const expiry = getTokenExpiry(token);
        if (expiry) {
            const delay = expiry - Date.now();
            if (delay <= 0) {
                performLogout();
                return;
            }
            expiryTimeoutRef.current = setTimeout(() => {
                performLogout();
            }, delay);
        }

        idleIntervalRef.current = setInterval(() => {
            const last = Number(localStorage.getItem("lastActivity") ?? "0");
            if (last && Date.now() - last > IDLE_TIMEOUT_MS) {
                performLogout();
            }
        }, 60 * 1000);
    };

    useEffect(() => {
        const storedUser = localStorage.getItem("user");
        const token = localStorage.getItem("token");
        if (!token) {
            if (storedUser) {
                localStorage.removeItem("user");
            }
            setIsLoading(false);
            return;
        }

        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        markActivity();
        scheduleSessionTimers(token);

        const validateSession = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!response.ok) {
                    throw new Error("Session invalid");
                }
                const data: User = await response.json();
                setUser(data);
                localStorage.setItem("user", JSON.stringify(data));
            } catch (error) {
                console.error("Session validation failed:", error);
                setUser(null);
                localStorage.removeItem("user");
                localStorage.removeItem("token");
            } finally {
                setIsLoading(false);
            }
        };

        void validateSession();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const handler = () => markActivity();
        const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
        events.forEach((event) => window.addEventListener(event, handler, { passive: true }));
        return () => {
            events.forEach((event) => window.removeEventListener(event, handler));
        };
    }, []);

    const completeAuthentication = (data: { access_token: string; user: User }) => {
        const authUser: User = data.user;
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user", JSON.stringify(authUser));
        markActivity();
        scheduleSessionTimers(data.access_token);
        setUser(authUser);

        if (authUser.role === "student") {
            router.push("/student-dashboard");
        } else if (authUser.role === "faculty") {
            router.push("/faculty-dashboard");
        } else {
            router.push("/dashboard");
        }
    };

    const authenticate = async ({ role, email, password }: LoginCredentials) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, role }),
        });

        if (!response.ok) {
            let detail = "Unable to sign in";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }

        const data = await response.json();
        completeAuthentication(data);
    };

    const login = async (credentials: LoginCredentials) => {
        await authenticate(credentials);
    };

    const requestLoginOtp = async ({ role, email, password }: LoginCredentials): Promise<LoginOtpChallenge> => {
        const response = await fetch(`${API_BASE_URL}/api/auth/login/request-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, role }),
        });

        if (!response.ok) {
            let detail = "Unable to send verification code";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }

        return response.json();
    };

    const verifyLoginOtp = async (challengeId: string, otpCode: string) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/login/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challenge_id: challengeId, otp_code: otpCode }),
        });

        if (!response.ok) {
            let detail = "Unable to verify code";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }

        const data = await response.json();
        completeAuthentication(data);
    };

    const register = async ({
        name,
        email,
        password,
        role,
        department,
        section_name,
        preferred_subject_codes,
    }: RegisterPayload) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                email,
                password,
                role,
                department,
                section_name,
                preferred_subject_codes: preferred_subject_codes ?? [],
            }),
        });

        if (!response.ok) {
            let detail = "Unable to register";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }
    };

    const requestPasswordReset = async (email: string) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/password/forgot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        if (!response.ok) {
            let detail = "Unable to request password reset";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }

        const data = await response.json();
        return { resetToken: data?.reset_token };
    };

    const confirmPasswordReset = async (token: string, newPassword: string) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/password/reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, new_password: newPassword }),
        });

        if (!response.ok) {
            let detail = "Unable to reset password";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        const token = localStorage.getItem("token");
        if (!token) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/password/change`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        });

        if (!response.ok) {
            let detail = "Unable to change password";
            try {
                const data = await response.json();
                detail = data?.detail ?? detail;
            } catch {
                // ignore response parsing errors
            }
            throw new Error(detail);
        }
    };

    const logout = async () => {
        const token = localStorage.getItem("token");
        if (token) {
            try {
                await fetch(`${API_BASE_URL}/api/auth/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch (error) {
                console.error("Logout request failed:", error);
            }
        }

        performLogout();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                requestLoginOtp,
                verifyLoginOtp,
                register,
                requestPasswordReset,
                confirmPasswordReset,
                changePassword,
                logout,
                isAuthenticated: !!user,
                isLoading,
            }}
        >
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
