"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Save } from "lucide-react";

export default function AvailabilityPage() {
    const [preferredDays, setPreferredDays] = useState<string[]>(["Monday", "Wednesday", "Friday"]);
    const [maxHours, setMaxHours] = useState([18]);
    const [preferredTimeStart, setPreferredTimeStart] = useState("09:00");
    const [preferredTimeEnd, setPreferredTimeEnd] = useState("17:00");
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const timeOptions = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

    const toggleDay = (day: string) => {
        if (preferredDays.includes(day)) {
            setPreferredDays(preferredDays.filter((d) => d !== day));
        } else {
            setPreferredDays([...preferredDays, day]);
        }
    };

    const handleSave = () => {
        setIsSaving(true);
        // Simulate API call
        setTimeout(() => {
            setIsSaving(false);
            // We don't have a configured Toaster yet, so we'll just log
            console.log("Saved preferences:", { preferredDays, maxHours: maxHours[0], preferredTimeStart, preferredTimeEnd, notes });
            alert("Preferences saved successfully!");
        }, 1000);
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Availability & Preferences</h1>
                <p className="text-muted-foreground">
                    Update your teaching preferences for the upcoming semester.
                </p>
            </div>

            <div className="grid gap-6">
                {/* Preferred Days */}
                <Card>
                    <CardHeader>
                        <CardTitle>Preferred Teaching Days</CardTitle>
                        <CardDescription>Select the days you are available to teach.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {days.map((day) => (
                                <div key={day} className="flex items-center space-x-2 border p-4 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleDay(day)}>
                                    <Checkbox
                                        id={day}
                                        checked={preferredDays.includes(day)}
                                        onCheckedChange={() => toggleDay(day)}
                                    />
                                    <Label htmlFor={day} className="cursor-pointer font-medium">{day}</Label>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Workload & Timing */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Workload Limit</CardTitle>
                            <CardDescription>Maximum teaching hours per week.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-2xl">{maxHours[0]} hours</span>
                                <span className="text-muted-foreground text-sm">/ week</span>
                            </div>
                            <Slider
                                value={maxHours}
                                onValueChange={setMaxHours}
                                max={40}
                                min={4}
                                step={1}
                                className="py-4"
                            />
                            <p className="text-xs text-muted-foreground">
                                Standard load is between 12-20 hours depending on your contract.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Preferred Time Slots</CardTitle>
                            <CardDescription>Your preferred daily teaching window.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Time</Label>
                                    <Select value={preferredTimeStart} onValueChange={setPreferredTimeStart}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {timeOptions.slice(0, -1).map(t => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>End Time</Label>
                                    <Select value={preferredTimeEnd} onValueChange={setPreferredTimeEnd}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {timeOptions.slice(1).map(t => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground pt-2">
                                <p>Note: Classes may still be scheduled outside these hours if necessary to resolve conflicts.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Notes */}
                <Card>
                    <CardHeader>
                        <CardTitle>Additional Constraints</CardTitle>
                        <CardDescription>Any specific requests or constraints for the scheduler.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            placeholder="E.g., Please avoid back-to-back lectures exceeding 3 hours. I prefer morning slots for labs."
                            className="min-h-[120px]"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </CardContent>
                    <CardFooter className="flex justify-end border-t p-6">
                        <Button onClick={handleSave} disabled={isSaving} size="lg">
                            {isSaving ? (
                                <>
                                    <span className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Preferences
                                </>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
