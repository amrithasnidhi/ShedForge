"use client";

import { useState } from "react";
import { Plus, Search, BookOpen, Layers, Users, MoreHorizontal, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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

interface Program {
    id: string;
    name: string;
    code: string;
    department: string;
    degree: "BS" | "MS" | "PhD";
    duration: number; // in years
    sections: number;
    totalStudents: number;
}

const mockPrograms: Program[] = [
    { id: "1", name: "Computer Science", code: "CS", department: "Computer Science", degree: "BS", duration: 4, sections: 8, totalStudents: 450 },
    { id: "2", name: "Data Science", code: "DS", department: "Computer Science", degree: "MS", duration: 2, sections: 4, totalStudents: 120 },
    { id: "3", name: "Electrical Engineering", code: "EE", department: "Electrical Engineering", degree: "BS", duration: 4, sections: 6, totalStudents: 300 },
    { id: "4", name: "Mechanical Engineering", code: "ME", department: "Mechanical Engineering", degree: "BS", duration: 4, sections: 6, totalStudents: 320 },
    { id: "5", name: "Physics", code: "PH", department: "Physics", degree: "BS", duration: 3, sections: 3, totalStudents: 90 },
];

import { useAuth } from "@/components/auth-provider";

export default function ProgramsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [searchTerm, setSearchTerm] = useState("");
    const [programs, setPrograms] = useState<Program[]>(mockPrograms);

    const filteredPrograms = programs.filter(
        (program) =>
            program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            program.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Programs & Sections</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage academic programs, degrees, and student sections
                    </p>
                </div>
                {!isAdmin && (
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Program
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Program</DialogTitle>
                                <DialogDescription>
                                    Create a new academic program and define its structure.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">
                                        Name
                                    </Label>
                                    <Input id="name" placeholder="Computer Science" className="col-span-3" />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="code" className="text-right">
                                        Code
                                    </Label>
                                    <Input id="code" placeholder="CS" className="col-span-3" />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="dept" className="text-right">
                                        Department
                                    </Label>
                                    <Input id="dept" placeholder="Computer Science" className="col-span-3" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit">Save Program</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Programs</CardTitle>
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{programs.length}</div>
                        <p className="text-xs text-muted-foreground font-medium text-success">+1 from last year</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Sections</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {programs.reduce((acc, p) => acc + p.sections, 0)}
                        </div>
                        <p className="text-xs text-muted-foreground font-medium text-success">+3 from last semester</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {programs.reduce((acc, p) => acc + p.totalStudents, 0)}
                        </div>
                        <p className="text-xs text-muted-foreground font-medium text-success">+25 enrolled</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search programs..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Program Name</TableHead>
                            <TableHead>Degree</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Sections</TableHead>
                            <TableHead>Students</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredPrograms.map((program) => (
                            <TableRow key={program.id}>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">{program.name}</span>
                                        <span className="text-xs text-muted-foreground">{program.code}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className="font-medium">
                                        {program.degree}
                                    </Badge>
                                </TableCell>
                                <TableCell>{program.department}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Layers className="h-3 w-3 text-muted-foreground" />
                                        <span>{program.sections}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                        <span>{program.totalStudents}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {!isAdmin && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                                <DropdownMenuItem>Manage Sections</DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
