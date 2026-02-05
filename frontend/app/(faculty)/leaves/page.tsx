"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type LeaveStatus = "approved" | "pending" | "rejected";

interface LeaveRequest {
    id: string;
    date: string;
    type: string;
    reason: string;
    status: LeaveStatus;
    adminComment?: string;
}

const mockLeaveHistory: LeaveRequest[] = [
    {
        id: "l1",
        date: "2026-02-13",
        type: "Personal",
        reason: "Family event",
        status: "pending",
    },
    {
        id: "l2",
        date: "2026-01-20",
        type: "Sick",
        reason: "Flu",
        status: "approved",
        adminComment: "Get well soon!",
    },
    {
        id: "l3",
        date: "2025-11-15",
        type: "Academic",
        reason: "Conference presentation",
        status: "approved",
    },
];

export default function LeavesPage() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [leaveType, setLeaveType] = useState("sick");
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [history, setHistory] = useState(mockLeaveHistory);

    const handleSubmit = () => {
        if (!date) return;

        setIsSubmitting(true);

        // Simulate API call
        setTimeout(() => {
            const newLeave: LeaveRequest = {
                id: `l${Date.now()}`,
                date: date.toISOString().split('T')[0],
                type: leaveType.charAt(0).toUpperCase() + leaveType.slice(1),
                reason: reason,
                status: "pending",
            };

            setHistory([newLeave, ...history]);
            setIsSubmitting(false);
            setReason("");
            alert("Leave request submitted successfully!");
        }, 1000);
    };

    const getStatusBadge = (status: LeaveStatus) => {
        switch (status) {
            case "approved":
                return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
            case "rejected":
                return <Badge variant="destructive">Rejected</Badge>;
            case "pending":
                return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">Pending</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
                <p className="text-muted-foreground">
                    Submit and track your leave requests.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* New Request Form */}
                <Card>
                    <CardHeader>
                        <CardTitle>New Leave Request</CardTitle>
                        <CardDescription>Select a date and provide a reason.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col gap-4 items-center sm:items-start">
                            <Label>Select Date</Label>
                            <div className="border rounded-md p-2">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    className="rounded-md"
                                    disabled={(date) => date < new Date()}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Leave Type</Label>
                            <Select value={leaveType} onValueChange={setLeaveType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sick">Sick Leave</SelectItem>
                                    <SelectItem value="casual">Casual Leave</SelectItem>
                                    <SelectItem value="academic">Academic / OOD</SelectItem>
                                    <SelectItem value="personal">Personal Emergency</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Reason</Label>
                            <Textarea
                                placeholder="Please provide details about your leave..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !date || !reason}>
                            {isSubmitting ? "Submitting..." : "Submit Request"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* Request History */}
                <Card>
                    <CardHeader>
                        <CardTitle>Request History</CardTitle>
                        <CardDescription>Recent leave applications and their status.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {history.map((item) => (
                                <div key={item.id} className="flex items-start justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-semibold">{item.date}</span>
                                        </div>
                                        <p className="text-sm font-medium">{item.type} Leave</p>
                                        <p className="text-xs text-muted-foreground max-w-[200px] truncate">{item.reason}</p>
                                        {item.adminComment && (
                                            <p className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                                                <span className="font-medium">Admin:</span> {item.adminComment}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {getStatusBadge(item.status)}
                                        <span className="text-xs text-muted-foreground capitalize">{item.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
