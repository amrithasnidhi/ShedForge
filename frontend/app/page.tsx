"use client";

import React from "react"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GraduationCap, Lock, User, ChevronRight, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const { requestLoginOtp, verifyLoginOtp, register, requestPasswordReset, confirmPasswordReset, user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<string>("admin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [preferredSubjectsInput, setPreferredSubjectsInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [resetHint, setResetHint] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<"credentials" | "verify">("credentials");
  const [otpCode, setOtpCode] = useState("");
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpDestination, setOtpDestination] = useState("");
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");

  const resetLoginChallenge = () => {
    setLoginStep("credentials");
    setOtpCode("");
    setOtpChallengeId("");
    setOtpDestination("");
    setOtpHint(null);
  };

  const resolveUiError = (err: unknown, fallback: string): string => {
    const detail = err instanceof Error ? err.message : fallback;
    if (detail === "Failed to fetch") {
      return `Cannot reach backend API at ${API_BASE_URL}. Start backend server and retry.`;
    }
    return detail;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "register") {
        if (!name.trim()) {
          throw new Error("Name is required");
        }
        if (role === "student" && !sectionName.trim()) {
          throw new Error("Section is required for student registration");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        await register({
          role: role as any,
          email,
          password,
          name: name.trim(),
          department: department.trim() || undefined,
          section_name: role === "student" ? (sectionName.trim() || undefined) : undefined,
          preferred_subject_codes:
            role === "faculty"
              ? preferredSubjectsInput
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              : undefined,
        });
        setMessage("Registration successful. Sign in to receive a one-time verification code.");
        setPassword("");
        setConfirmPassword("");
        setSectionName("");
        setPreferredSubjectsInput("");
        setMode("login");
        resetLoginChallenge();
      } else {
        if (loginStep === "credentials") {
          if (!email.trim() || !password.trim()) {
            throw new Error("Email and password are required");
          }
          const challenge = await requestLoginOtp({ role: role as any, email, password });
          setOtpChallengeId(challenge.challenge_id);
          setOtpDestination(challenge.email);
          setOtpHint(challenge.otp_hint ?? null);
          setLoginStep("verify");
          setMessage(challenge.message);
        } else {
          if (!otpChallengeId) {
            throw new Error("Verification challenge expired. Request a new code.");
          }
          if (!/^\d{6}$/.test(otpCode.trim())) {
            throw new Error("Enter the 6-digit verification code");
          }
          await verifyLoginOtp(otpChallengeId, otpCode.trim());
        }
      }
    } catch (err) {
      setError(resolveUiError(err, "Unable to sign in"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      const challenge = await requestLoginOtp({ role: role as any, email, password });
      setOtpChallengeId(challenge.challenge_id);
      setOtpDestination(challenge.email);
      setOtpHint(challenge.otp_hint ?? null);
      setOtpCode("");
      setMessage("A fresh verification code has been sent.");
    } catch (err) {
      setError(resolveUiError(err, "Unable to resend verification code"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setResetHint(null);

    try {
      if (!resetRequested) {
        const result = await requestPasswordReset(email);
        if (result.resetToken) {
          setResetToken(result.resetToken);
          setResetHint("Reset token generated for this environment. Paste it below to continue.");
        } else {
          setResetHint("If the email exists, reset instructions have been sent.");
        }
        setResetRequested(true);
      } else {
        if (!resetToken.trim()) {
          throw new Error("Reset token is required");
        }
        if (resetPassword !== resetConfirmPassword) {
          throw new Error("Passwords do not match");
        }
        await confirmPasswordReset(resetToken.trim(), resetPassword);
        setResetRequested(false);
        setResetToken("");
        setResetPassword("");
        setResetConfirmPassword("");
        setResetHint("Password updated. Sign in with your new password.");
        setMode("login");
        resetLoginChallenge();
      }
    } catch (err) {
      setError(resolveUiError(err, "Unable to reset password"));
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (authLoading) {
      return;
    }
    if (user) {
      if (user.role === "student") {
        router.replace("/student-dashboard");
      } else if (user.role === "faculty") {
        router.replace("/faculty-dashboard");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [authLoading, router, user]);

  return (
    <div className="relative min-h-screen flex">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] xl:w-[56%] bg-gradient-to-b from-primary via-primary to-[#8f006a] flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/10">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="text-2xl font-semibold text-primary-foreground">ShedForge</span>
        </div>

        <div className="space-y-8 max-w-2xl">
          <h1 className="text-4xl xl:text-6xl font-semibold text-primary-foreground leading-tight text-balance">
            Timetable Scheduling System
          </h1>
          <p className="text-lg xl:text-2xl text-primary-foreground/85 max-w-2xl leading-relaxed">
            ShedForge is an optimization-first academic scheduling platform built for high-volume institutional operations.
            It combines automation, governance, and live visibility to generate reliable timetables faster with fewer manual corrections.
          </p>

          <div className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/8 p-5 xl:p-6 space-y-4">
            <p className="text-sm xl:text-base uppercase tracking-[0.12em] text-primary-foreground/80">Why ShedForge Stands Out</p>
            <div className="grid grid-cols-1 gap-3 xl:gap-4 text-primary-foreground/85">
              <p className="text-base xl:text-lg">Conflict-first generation with multi-objective optimization at scale.</p>
              <p className="text-base xl:text-lg">Live algorithm visibility with convergence logs and transparent resolution flow.</p>
              <p className="text-base xl:text-lg">Program-scoped data architecture for clean separation and reliable governance.</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm xl:text-base uppercase tracking-[0.12em] text-primary-foreground/75">Methodology</p>
            <div className="flex flex-col gap-3 text-primary-foreground/80">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/12">
                  <span className="text-sm font-medium text-primary-foreground">1</span>
                </div>
                <span>Genetic hyperparameter tuning for scenario-specific search control.</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/12">
                  <span className="text-sm font-medium text-primary-foreground">2</span>
                </div>
                <span>MOEA exploration to discover high-quality feasible timetable regions.</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/12">
                  <span className="text-sm font-medium text-primary-foreground">3</span>
                </div>
                <span>Simulated Annealing exploitation and automated conflict repair for final refinement.</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-primary-foreground/55">
          ShedForge Campus Scheduling
        </p>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 lg:px-10 xl:px-14 bg-background">
        <div className="w-full max-w-2xl xl:max-w-3xl space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <GraduationCap className="h-7 w-7 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold text-foreground">ShedForge</span>
          </div>

          <Card className="border-border shadow-md min-h-[620px]">
            <CardHeader className="space-y-2 pb-6 px-6 pt-6 md:px-10 md:pt-10">
              <CardTitle className="text-3xl font-semibold">
                {mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Reset password"
                    : loginStep === "verify"
                      ? "Verify login"
                      : "Sign in"}
              </CardTitle>
              <CardDescription>
                {mode === "register"
                  ? "Create your account with institutional details. Sign-in uses email verification."
                  : mode === "forgot"
                    ? "Request a reset token, then set a new password securely."
                    : loginStep === "verify"
                      ? "Enter the 6-digit verification code sent to your email."
                      : "Step 1 of 2: submit credentials to receive a one-time email verification code."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6 md:px-10 md:pb-10">
              {mode === "forgot" ? (
                <form onSubmit={handleForgotSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                       
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  {resetRequested ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="reset-token">Reset token</Label>
                        <Input
                          id="reset-token"
                          type="text"
                         
                          value={resetToken}
                          onChange={(e) => setResetToken(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reset-password">New password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="reset-password"
                            type="password"
                           
                            className="pl-10"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reset-confirm">Confirm new password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="reset-confirm"
                            type="password"
                           
                            className="pl-10"
                            value={resetConfirmPassword}
                            onChange={(e) => setResetConfirmPassword(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  ) : null}

                  {resetHint ? <p className="text-sm text-muted-foreground">{resetHint}</p> : null}
                  {message ? <p className="text-sm text-success">{message}</p> : null}
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {resetRequested ? "Update Password" : "Send Reset Instructions"}
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {mode === "register" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="name">Full name</Label>
                        <Input
                          id="name"
                          type="text"
                         
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="department">Department (optional)</Label>
                        <Input
                          id="department"
                          type="text"
                         
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                        />
                      </div>
                      {role === "student" ? (
                        <div className="space-y-2">
                          <Label htmlFor="section-name">Section</Label>
                          <Input
                            id="section-name"
                            type="text"
                           
                            value={sectionName}
                            onChange={(e) => setSectionName(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Enter your class section to load your personal timetable automatically.
                          </p>
                        </div>
                      ) : null}
                      {role === "faculty" ? (
                        <div className="space-y-2">
                          <Label htmlFor="preferred-subjects">Preferred Subjects (optional)</Label>
                          <Input
                            id="preferred-subjects"
                            type="text"
                           
                            value={preferredSubjectsInput}
                            onChange={(e) => setPreferredSubjectsInput(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Use comma-separated subject codes. You can edit this later in Faculty Availability.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                <div className="space-y-2">
                  <Label htmlFor="role">I am a...</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role">
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator / Scheduler</SelectItem>
                      <SelectItem value="faculty">Faculty Member</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                     
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading || (mode === "login" && loginStep === "verify")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                     
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading || (mode === "login" && loginStep === "verify")}
                    />
                  </div>
                </div>

                {mode === "register" ? (
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                       
                        className="pl-10"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use at least 8 characters with a mix of letters, numbers, and symbols.
                    </p>
                  </div>
                ) : null}

                {mode === "login" && loginStep === "verify" ? (
                  <>
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="flex items-center gap-2 font-medium">
                        <ShieldCheck className="h-4 w-4" />
                        Verification code sent to {otpDestination || email}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Check your inbox and enter the 6-digit code below to complete login.
                      </p>
                      {otpHint ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Dev hint: <span className="font-mono">{otpHint}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="otp-code">Verification code</Label>
                      <Input
                        id="otp-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                       
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => void handleResendOtp()}
                        disabled={isLoading}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Resend Code
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          resetLoginChallenge();
                          setError(null);
                          setMessage(null);
                        }}
                        disabled={isLoading}
                      >
                        Edit Credentials
                      </Button>
                    </div>
                  </>
                ) : null}

                {message ? <p className="text-sm text-success">{message}</p> : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {mode === "register"
                        ? "Creating account..."
                        : loginStep === "verify"
                          ? "Verifying..."
                          : "Sending verification code..."}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {mode === "register"
                        ? "Create account"
                        : loginStep === "verify"
                          ? "Verify & Sign In"
                          : `Send Code as ${role.charAt(0).toUpperCase() + role.slice(1)}`}
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>
              )}
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground space-y-2">
            {mode === "register" ? (
              <button
                type="button"
                className="block mx-auto text-primary hover:underline"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setMessage(null);
                    setPreferredSubjectsInput("");
                    setResetRequested(false);
                    setResetHint(null);
                    setResetToken("");
                  setResetPassword("");
                  setResetConfirmPassword("");
                  resetLoginChallenge();
                }}
              >
                Already have an account? Sign in
              </button>
            ) : mode === "forgot" ? (
              <button
                type="button"
                className="block mx-auto text-primary hover:underline"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setMessage(null);
                    setPreferredSubjectsInput("");
                    setResetRequested(false);
                    setResetHint(null);
                    setResetToken("");
                  setResetPassword("");
                  setResetConfirmPassword("");
                  resetLoginChallenge();
                }}
              >
                Back to sign in
              </button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                    setMessage(null);
                    setPreferredSubjectsInput("");
                    setResetRequested(false);
                    setResetHint(null);
                    setResetToken("");
                    setResetPassword("");
                    setResetConfirmPassword("");
                    resetLoginChallenge();
                  }}
                >
                  Need an account? Register
                </button>
                <span className="text-muted-foreground/60">|</span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setMessage(null);
                    setPreferredSubjectsInput("");
                    setResetRequested(false);
                    setResetHint(null);
                    setResetToken("");
                    setResetPassword("");
                    setResetConfirmPassword("");
                    resetLoginChallenge();
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}
            <p>Contact your department administrator if you need account access.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
