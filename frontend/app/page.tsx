"use client";

import React from "react"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GraduationCap, Lock, User, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<string>("admin");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate API call delay
    setTimeout(() => {
      login(role as any, email);
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/10">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="text-2xl font-semibold text-primary-foreground">UniSchedule</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-semibold text-primary-foreground leading-tight text-balance">
            AI-Powered Timetable Scheduling System
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Automated faculty workload optimization and conflict-free schedule generation for modern universities.
          </p>
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex items-center gap-3 text-primary-foreground/70">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10">
                <span className="text-sm font-medium text-primary-foreground">1</span>
              </div>
              <span>Intelligent constraint satisfaction</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/70">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10">
                <span className="text-sm font-medium text-primary-foreground">2</span>
              </div>
              <span>Automatic conflict resolution</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/70">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10">
                <span className="text-sm font-medium text-primary-foreground">3</span>
              </div>
              <span>Faculty workload balancing</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-primary-foreground/50">
          University of Technology, 2026
        </p>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <GraduationCap className="h-7 w-7 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold text-foreground">UniSchedule</span>
          </div>

          <Card className="border-border shadow-sm">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-semibold">Sign in</CardTitle>
              <CardDescription>
                Enter your credentials to access the scheduling system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="role">I am a...</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Select your role" />
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
                      placeholder="name@university.edu"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                      placeholder="Enter your password"
                      className="pl-10"
                      defaultValue="password123"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign in as {role.charAt(0).toUpperCase() + role.slice(1)}
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Contact IT support if you need access credentials
          </p>
        </div>
      </div>
    </div>
  );
}
