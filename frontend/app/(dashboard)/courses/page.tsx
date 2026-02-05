"use client";

import { useState } from "react";
import { Plus, Search, Edit, Trash2, Filter, BookOpen } from "lucide-react";
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
import { courseData } from "@/lib/mock-data";

import { useAuth } from "@/components/auth-provider";

export default function CoursesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    const filteredCourses = courseData.filter((course) => {
        const matchesSearch =
            course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || course.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const courseTypes = Array.from(new Set(courseData.map((c) => c.type)));
    const theoryCourses = courseData.filter((c) => c.type === "theory").length;
    const labCourses = courseData.filter((c) => c.type === "lab").length;
    const electiveCourses = courseData.filter((c) => c.type === "elective").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Course Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage courses, sections, and scheduling requirements
                    </p>
                </div>
                {!isAdmin && (
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Course
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Add New Course</DialogTitle>
                                <DialogDescription>
                                    Enter course details and scheduling requirements
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="code">Course Code</Label>
                                    <Input id="code" placeholder="CS101" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="courseName">Course Name</Label>
                                    <Input id="courseName" placeholder="Introduction to Programming" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="type">Course Type</Label>
                                    <Select>
                                        <SelectTrigger id="type">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="theory">Theory</SelectItem>
                                            <SelectItem value="lab">Lab</SelectItem>
                                            <SelectItem value="elective">Elective</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="credits">Credits</Label>
                                    <Input id="credits" type="number" placeholder="3" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sections">Number of Sections</Label>
                                    <Input id="sections" type="number" placeholder="2" defaultValue="1" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="hoursPerWeek">Hours per Week</Label>
                                    <Input id="hoursPerWeek" type="number" placeholder="3" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => setIsAddDialogOpen(false)}>Add Course</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Courses</CardDescription>
                        <CardTitle className="text-3xl">{courseData.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Theory Courses</CardDescription>
                        <CardTitle className="text-3xl">{theoryCourses}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Lab Courses</CardDescription>
                        <CardTitle className="text-3xl">{labCourses}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Electives</CardDescription>
                        <CardTitle className="text-3xl">{electiveCourses}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters and Search */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Course Catalog</CardTitle>
                    <CardDescription>Search and filter courses</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by code or name..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {courseTypes.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Courses Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Course Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Credits</TableHead>
                                    <TableHead className="text-right">Sections</TableHead>
                                    <TableHead className="text-right">Hours/Week</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCourses.map((course) => (
                                    <TableRow key={course.id}>
                                        <TableCell className="font-mono font-medium">{course.code}</TableCell>
                                        <TableCell>{course.name}</TableCell>
                                        <TableCell>
                                            {course.type === "theory" && (
                                                <Badge variant="outline" className="text-primary border-primary">
                                                    Theory
                                                </Badge>
                                            )}
                                            {course.type === "lab" && (
                                                <Badge variant="outline" className="text-accent border-accent">
                                                    Lab
                                                </Badge>
                                            )}
                                            {course.type === "elective" && (
                                                <Badge variant="outline" className="text-chart-4 border-chart-4">
                                                    Elective
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{course.credits}</TableCell>
                                        <TableCell className="text-right tabular-nums">{course.sections || 1}</TableCell>
                                        <TableCell className="text-right tabular-nums">{course.hoursPerWeek || 3}</TableCell>
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
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
