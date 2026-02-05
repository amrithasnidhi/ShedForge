"use client";

import { useState } from "react";
import {
    Settings,
    User,
    Bell,
    Shield,
    Database,
    Save,
    School
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";



import { useAuth } from "@/components/auth-provider";

export default function SettingsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [activeTab, setActiveTab] = useState("general");

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    Settings
                </h1>
                <p className="text-muted-foreground mt-2">
                    Manage your institution preferences and system configurations.
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Navigation for Settings */}
                <aside className="md:w-64 space-y-2">
                    {[
                        { id: "general", label: "General", icon: Settings },
                        { id: "academic", label: "Academic Years", icon: School },
                        { id: "users", label: "User Management", icon: User },
                        { id: "notifications", label: "Notifications", icon: Bell },
                        { id: "system", label: "System", icon: Database },
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === item.id
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </button>
                    ))}
                </aside>

                {/* Main Content Area */}
                <main className="flex-1">
                    {/* General Settings */}
                    {activeTab === "general" && (
                        <Card className="border-t-4 border-t-primary card-modern">
                            <CardHeader>
                                <CardTitle>Institution Profile</CardTitle>
                                <CardDescription>Update your university details and branding.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>Institution Name</Label>
                                    <Input defaultValue="Amrita Vishwa Vidyapeetham" className="bg-background/50" readOnly={isAdmin} />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Campus Location</Label>
                                    <Input defaultValue="Coimbatore" className="bg-background/50" readOnly={isAdmin} />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Time Zone</Label>
                                    <Input defaultValue="(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi" className="bg-background/50" readOnly={isAdmin} />
                                </div>
                            </CardContent>
                            {!isAdmin && (
                                <CardFooter className="justify-end border-t border-border/40 pt-6">
                                    <Button>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                    )}

                    {/* Academic Settings */}
                    {activeTab === "academic" && (
                        <Card className="border-t-4 border-t-primary card-modern">
                            <CardHeader>
                                <CardTitle>Academic Configuration</CardTitle>
                                <CardDescription>Manage active semesters and working days.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Current Academic Year</Label>
                                        <p className="text-sm text-muted-foreground">Set the default active year for all modules</p>
                                    </div>
                                    <div className="w-[180px]">
                                        <Input defaultValue="2025-26" className="font-mono text-center" readOnly={isAdmin} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Label>Working Days</Label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                                            <div key={day} className="flex items-center space-x-2 border p-3 rounded-md bg-background/30">
                                                <Switch id={`day-${day}`} defaultChecked={day !== "Sun"} disabled={isAdmin} />
                                                <Label htmlFor={`day-${day}`}>{day}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                            {!isAdmin && (
                                <CardFooter className="justify-end border-t border-border/40 pt-6">
                                    <Button>
                                        <Save className="h-4 w-4 mr-2" />
                                        Update Configuration
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                    )}

                    {/* System Settings */}
                    {activeTab === "system" && (
                        <div className="space-y-6">
                            {isAdmin ? (
                                <Card className="card-modern">
                                    <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                        <Shield className="h-12 w-12 mb-4 opacity-20" />
                                        <h3 className="text-lg font-semibold">Restricted Access</h3>
                                        <p>You do not have permission to access system settings.</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="border-t-4 border-t-red-500 card-modern">
                                    <CardHeader>
                                        <CardTitle className="text-red-500">Danger Zone</CardTitle>
                                        <CardDescription>Irreversible actions for system data.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                            <div>
                                                <h4 className="font-semibold text-red-700 dark:text-red-400">Reset All Schedules</h4>
                                                <p className="text-sm text-red-600/80 dark:text-red-400/70">Delete all generated timetables. This cannot be undone.</p>
                                            </div>
                                            <Button variant="destructive">Reset Schedules</Button>
                                        </div>
                                        <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                            <div>
                                                <h4 className="font-semibold text-red-700 dark:text-red-400">Clear Master Data</h4>
                                                <p className="text-sm text-red-600/80 dark:text-red-400/70">Remove all faculty, courses, and rooms.</p>
                                            </div>
                                            <Button variant="destructive">Clear Data</Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Placeholder for others */}
                    {(activeTab === "users" || activeTab === "notifications") && (
                        <Card className="card-modern">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                <Shield className="h-12 w-12 mb-4 opacity-20" />
                                <h3 className="text-lg font-semibold">Coming Soon</h3>
                                <p>This settings module is currently under development.</p>
                            </CardContent>
                        </Card>
                    )}

                </main>
            </div>
        </div>
    );
}
