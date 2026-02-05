"use client";

import { useState } from "react";
import { Plus, Search, Edit, Trash2, Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { facultyData } from "@/lib/mock-data";

import { useAuth } from "@/components/auth-provider";

export default function FacultyPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [searchQuery, setSearchQuery] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    const filteredFaculty = facultyData.filter((faculty) => {
        const matchesSearch =
            faculty.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faculty.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDepartment = departmentFilter === "all" || faculty.department === departmentFilter;
        return matchesSearch && matchesDepartment;
    });

    const departments = Array.from(new Set(facultyData.map((f) => f.department)));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Faculty Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage faculty profiles, availability, and workload preferences
                    </p>
                </div>
                {!isAdmin && (
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Faculty
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Add New Faculty</DialogTitle>
                                <DialogDescription>
                                    Enter faculty member details and availability preferences
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input id="name" placeholder="Dr. John Smith" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" placeholder="john.smith@university.edu" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="department">Department</Label>
                                    <Select>
                                        <SelectTrigger id="department">
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {departments.map((dept) => (
                                                <SelectItem key={dept} value={dept}>
                                                    {dept}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="maxHours">Maximum Weekly Hours</Label>
                                    <Input id="maxHours" type="number" placeholder="20" defaultValue="20" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => setIsAddDialogOpen(false)}>Add Faculty</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Faculty</CardDescription>
                        <CardTitle className="text-3xl">{facultyData.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Departments</CardDescription>
                        <CardTitle className="text-3xl">{departments.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Avg. Workload</CardDescription>
                        <CardTitle className="text-3xl">
                            {(facultyData.reduce((sum, f) => sum + (f.currentWorkload || 0), 0) / facultyData.length).toFixed(1)}h
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Overloaded</CardDescription>
                        <CardTitle className="text-3xl text-destructive">
                            {facultyData.filter((f) => (f.currentWorkload || 0) > (f.maxHours || 20)).length}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters and Search */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Faculty Directory</CardTitle>
                    <CardDescription>Search and filter faculty members</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="All Departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {departments.map((dept) => (
                                    <SelectItem key={dept} value={dept}>
                                        {dept}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Faculty Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Current Workload</TableHead>
                                    <TableHead className="text-right">Max Hours</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredFaculty.map((faculty) => {
                                    const workload = faculty.currentWorkload || 0;
                                    const maxHours = faculty.maxHours || 20;
                                    const isOverloaded = workload > maxHours;
                                    const utilizationPercent = (workload / maxHours) * 100;

                                    return (
                                        <TableRow key={faculty.id}>
                                            <TableCell className="font-medium">{faculty.name}</TableCell>
                                            <TableCell>{faculty.department}</TableCell>
                                            <TableCell className="text-muted-foreground">{faculty.email}</TableCell>
                                            <TableCell className="text-right tabular-nums">{workload}h</TableCell>
                                            <TableCell className="text-right tabular-nums">{maxHours}h</TableCell>
                                            <TableCell className="text-center">
                                                {isOverloaded ? (
                                                    <Badge variant="outline" className="text-destructive border-destructive">
                                                        Overloaded
                                                    </Badge>
                                                ) : utilizationPercent > 80 ? (
                                                    <Badge variant="outline" className="text-warning border-warning">
                                                        High Load
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-success border-success">
                                                        Normal
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {!isAdmin && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Delete</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
