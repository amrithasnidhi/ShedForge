"use client";

import { useState } from "react";
import { Plus, Trash2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

type ConstraintType = "hard" | "soft";
type ConstraintCategory = "faculty" | "room" | "time" | "workload" | "custom";

interface Constraint {
    id: string;
    type: ConstraintType;
    category: ConstraintCategory;
    description: string;
    priority: number;
    enabled: boolean;
}

const defaultConstraints: Constraint[] = [
    {
        id: "1",
        type: "hard",
        category: "faculty",
        description: "No faculty member can teach in two rooms simultaneously",
        priority: 10,
        enabled: true,
    },
    {
        id: "2",
        type: "hard",
        category: "room",
        description: "No room can host two classes at the same time",
        priority: 10,
        enabled: true,
    },
    {
        id: "3",
        type: "hard",
        category: "time",
        description: "Lab sessions must be scheduled in consecutive time slots",
        priority: 9,
        enabled: true,
    },
    {
        id: "4",
        type: "soft",
        category: "workload",
        description: "Faculty workload should not exceed 20 hours per week",
        priority: 8,
        enabled: true,
    },
    {
        id: "5",
        type: "soft",
        category: "time",
        description: "Avoid scheduling classes before 9:00 AM",
        priority: 5,
        enabled: true,
    },
    {
        id: "6",
        type: "soft",
        category: "faculty",
        description: "Minimize gaps between consecutive classes for faculty",
        priority: 7,
        enabled: true,
    },
];

import { useAuth } from "@/components/auth-provider";

export default function ConstraintsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [constraints, setConstraints] = useState<Constraint[]>(defaultConstraints);
    const [newConstraint, setNewConstraint] = useState({
        type: "hard" as ConstraintType,
        category: "faculty" as ConstraintCategory,
        description: "",
        priority: 5,
    });

    const handleAddConstraint = () => {
        if (!newConstraint.description.trim()) return;

        const constraint: Constraint = {
            id: Date.now().toString(),
            ...newConstraint,
            enabled: true,
        };

        setConstraints([...constraints, constraint]);
        setNewConstraint({
            type: "hard",
            category: "faculty",
            description: "",
            priority: 5,
        });
    };

    const handleDeleteConstraint = (id: string) => {
        setConstraints(constraints.filter((c) => c.id !== id));
    };

    const handleToggleConstraint = (id: string) => {
        setConstraints(
            constraints.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
        );
    };

    const hardConstraints = constraints.filter((c) => c.type === "hard");
    const softConstraints = constraints.filter((c) => c.type === "soft");

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold text-foreground">Constraint Configuration</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Define scheduling rules and optimization priorities
                </p>
            </div>

            {/* Info Alert */}
            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Constraint Types</AlertTitle>
                <AlertDescription>
                    <strong>Hard constraints</strong> must be satisfied (e.g., no double-booking).{" "}
                    <strong>Soft constraints</strong> are preferences that the optimizer will try to satisfy
                    when possible (e.g., minimize commute time).
                </AlertDescription>
            </Alert>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Constraints</CardDescription>
                        <CardTitle className="text-3xl">{constraints.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Hard Constraints</CardDescription>
                        <CardTitle className="text-3xl text-destructive">{hardConstraints.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Soft Constraints</CardDescription>
                        <CardTitle className="text-3xl text-warning">{softConstraints.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Active</CardDescription>
                        <CardTitle className="text-3xl text-success">
                            {constraints.filter((c) => c.enabled).length}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Add New Constraint */}
            {!isAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Add New Constraint</CardTitle>
                        <CardDescription>Define a custom scheduling rule</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="type">Constraint Type</Label>
                                    <Select
                                        value={newConstraint.type}
                                        onValueChange={(value) =>
                                            setNewConstraint({ ...newConstraint, type: value as ConstraintType })
                                        }
                                    >
                                        <SelectTrigger id="type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="hard">Hard (Must Satisfy)</SelectItem>
                                            <SelectItem value="soft">Soft (Preference)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="category">Category</Label>
                                    <Select
                                        value={newConstraint.category}
                                        onValueChange={(value) =>
                                            setNewConstraint({ ...newConstraint, category: value as ConstraintCategory })
                                        }
                                    >
                                        <SelectTrigger id="category">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="faculty">Faculty</SelectItem>
                                            <SelectItem value="room">Room</SelectItem>
                                            <SelectItem value="time">Time</SelectItem>
                                            <SelectItem value="workload">Workload</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="description">Description</Label>
                                <Input
                                    id="description"
                                    placeholder="e.g., Professor X prefers afternoon classes"
                                    value={newConstraint.description}
                                    onChange={(e) =>
                                        setNewConstraint({ ...newConstraint, description: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="priority">
                                    Priority (1-10) {newConstraint.type === "hard" ? "(Higher = More Critical)" : "(Higher = More Preferred)"}
                                </Label>
                                <Input
                                    id="priority"
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={newConstraint.priority}
                                    onChange={(e) =>
                                        setNewConstraint({ ...newConstraint, priority: parseInt(e.target.value) || 5 })
                                    }
                                />
                            </div>
                            <Button onClick={handleAddConstraint} className="w-full sm:w-auto">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Constraint
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Constraints List */}
            <Tabs defaultValue="all" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="all">All ({constraints.length})</TabsTrigger>
                    <TabsTrigger value="hard">Hard ({hardConstraints.length})</TabsTrigger>
                    <TabsTrigger value="soft">Soft ({softConstraints.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-4">
                    {constraints.map((constraint) => (
                        <ConstraintCard
                            key={constraint.id}
                            constraint={constraint}
                            onToggle={handleToggleConstraint}
                            onDelete={handleDeleteConstraint}
                            isAdmin={isAdmin}
                        />
                    ))}
                </TabsContent>

                <TabsContent value="hard" className="space-y-4">
                    {hardConstraints.map((constraint) => (
                        <ConstraintCard
                            key={constraint.id}
                            constraint={constraint}
                            onToggle={handleToggleConstraint}
                            onDelete={handleDeleteConstraint}
                            isAdmin={isAdmin}
                        />
                    ))}
                </TabsContent>

                <TabsContent value="soft" className="space-y-4">
                    {softConstraints.map((constraint) => (
                        <ConstraintCard
                            key={constraint.id}
                            constraint={constraint}
                            onToggle={handleToggleConstraint}
                            onDelete={handleDeleteConstraint}
                            isAdmin={isAdmin}
                        />
                    ))}
                </TabsContent>
            </Tabs>
        </div>
    );
}

function ConstraintCard({
    constraint,
    onToggle,
    onDelete,
    isAdmin,
}: {
    constraint: Constraint;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    isAdmin: boolean;
}) {
    return (
        <Card className={!constraint.enabled ? "opacity-60" : ""}>
            <CardContent className="flex items-start justify-between py-4">
                <div className="flex items-start gap-4 flex-1">
                    <div className="flex items-center gap-2 min-w-[100px]">
                        {constraint.type === "hard" ? (
                            <Badge variant="outline" className="text-destructive border-destructive">
                                Hard
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-warning border-warning">
                                Soft
                            </Badge>
                        )}
                    </div>
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            {constraint.enabled ? (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <p className="font-medium">{constraint.description}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Category: {constraint.category}</span>
                            <Separator orientation="vertical" className="h-4" />
                            <span>Priority: {constraint.priority}/10</span>
                        </div>
                    </div>
                </div>
                {!isAdmin && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggle(constraint.id)}
                        >
                            {constraint.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => onDelete(constraint.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
