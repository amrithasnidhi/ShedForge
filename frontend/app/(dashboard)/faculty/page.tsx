"use client";

import { useEffect, useMemo, useState } from "react";
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

import { useAuth } from "@/components/auth-provider";
import {
    createFaculty,
    deleteFaculty,
    listFaculty,
    updateFaculty,
    type Faculty,
    type FacultyUpdate,
} from "@/lib/academic-api";

export default function FacultyPage() {
    const { user } = useAuth();
    const canManage = user?.role === "admin" || user?.role === "scheduler";
    const [searchQuery, setSearchQuery] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [faculty, setFaculty] = useState<Faculty[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [formValues, setFormValues] = useState({
        name: "",
        designation: "",
        email: "",
        department: "",
        max_hours: 20,
    });
    const [editFaculty, setEditFaculty] = useState<Faculty | null>(null);
    const [editFormValues, setEditFormValues] = useState<FacultyUpdate>({
        name: "",
        designation: "",
        email: "",
        department: "",
        max_hours: 20,
        workload_hours: 0,
    });

    useEffect(() => {
        const loadFaculty = async () => {
            try {
                const data = await listFaculty();
                setFaculty(data);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load faculty";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        void loadFaculty();
    }, []);

    const handleAddFaculty = async () => {
        setError(null);
        try {
            const created = await createFaculty({
                name: formValues.name,
                designation: formValues.designation || "Faculty",
                email: formValues.email,
                department: formValues.department,
                max_hours: formValues.max_hours,
            });
            setFaculty((prev) => [...prev, created]);
            setIsAddDialogOpen(false);
            setFormValues({
                name: "",
                designation: "",
                email: "",
                department: "",
                max_hours: 20,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create faculty";
            setError(message);
        }
    };

    const handleDeleteFaculty = async (facultyId: string) => {
        if (!window.confirm("Delete this faculty member?")) {
            return;
        }
        setError(null);
        try {
            await deleteFaculty(facultyId);
            setFaculty((prev) => prev.filter((member) => member.id !== facultyId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete faculty";
            setError(message);
        }
    };

    const openEditFaculty = (member: Faculty) => {
        setEditFaculty(member);
        setEditFormValues({
            name: member.name,
            designation: member.designation,
            email: member.email,
            department: member.department,
            max_hours: member.max_hours,
            workload_hours: member.workload_hours,
        });
        setIsEditDialogOpen(true);
    };

    const handleUpdateFaculty = async () => {
        if (!editFaculty) {
            return;
        }
        setError(null);
        try {
            const updated = await updateFaculty(editFaculty.id, editFormValues);
            setFaculty((prev) => prev.map((member) => (member.id === updated.id ? updated : member)));
            setIsEditDialogOpen(false);
            setEditFaculty(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to update faculty";
            setError(message);
        }
    };

    const filteredFaculty = faculty.filter((member) => {
        const matchesSearch =
            member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDepartment = departmentFilter === "all" || member.department === departmentFilter;
        return matchesSearch && matchesDepartment;
    });

    const departments = useMemo(() => Array.from(new Set(faculty.map((f) => f.department))), [faculty]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Faculty Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage faculty profiles, availability, and workload preferences
                    </p>
                </div>
                {canManage && (
                    <>
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
                                        <Input
                                            id="name"
                                           
                                            value={formValues.name}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                           
                                            value={formValues.email}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, email: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="designation">Designation</Label>
                                        <Input
                                            id="designation"
                                           
                                            value={formValues.designation}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, designation: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="department">Department</Label>
                                        <Input
                                            id="department"
                                           
                                            value={formValues.department}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, department: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="maxHours">Maximum Weekly Hours</Label>
                                        <Input
                                            id="maxHours"
                                            type="number"
                                           
                                            value={formValues.max_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    max_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleAddFaculty}>Add Faculty</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Edit Faculty</DialogTitle>
                                    <DialogDescription>Update faculty member details</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-name">Full Name</Label>
                                        <Input
                                            id="edit-name"
                                            value={editFormValues.name ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-email">Email</Label>
                                        <Input
                                            id="edit-email"
                                            type="email"
                                            value={editFormValues.email ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, email: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-designation">Designation</Label>
                                        <Input
                                            id="edit-designation"
                                            value={editFormValues.designation ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, designation: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-department">Department</Label>
                                        <Input
                                            id="edit-department"
                                            value={editFormValues.department ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, department: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-workload">Current Workload (hours)</Label>
                                        <Input
                                            id="edit-workload"
                                            type="number"
                                            value={editFormValues.workload_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    workload_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-maxHours">Maximum Weekly Hours</Label>
                                        <Input
                                            id="edit-maxHours"
                                            type="number"
                                            value={editFormValues.max_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    max_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdateFaculty}>Save Changes</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Faculty</CardDescription>
                        <CardTitle className="text-3xl">{faculty.length}</CardTitle>
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
                            {faculty.length
                                ? (
                                      faculty.reduce((sum, f) => sum + (f.workload_hours || 0), 0) /
                                      faculty.length
                                  ).toFixed(1)
                                : "0.0"}
                            h
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Overloaded</CardDescription>
                        <CardTitle className="text-3xl text-destructive">
                            {faculty.filter((f) => (f.workload_hours || 0) > (f.max_hours || 20)).length}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

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
                               
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue/>
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

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Designation</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Workload</TableHead>
                                    <TableHead>Max Hours</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                                            Loading faculty...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredFaculty.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                                            No faculty found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredFaculty.map((member) => (
                                        <TableRow key={member.id}>
                                            <TableCell className="font-medium">{member.name}</TableCell>
                                            <TableCell>{member.email}</TableCell>
                                            <TableCell>{member.designation}</TableCell>
                                            <TableCell>{member.department}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{member.workload_hours}h</Badge>
                                            </TableCell>
                                            <TableCell>{member.max_hours}h</TableCell>
                                            <TableCell className="text-right">
                                                {canManage && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => openEditFaculty(member)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive"
                                                            onClick={() => handleDeleteFaculty(member.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Delete</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
