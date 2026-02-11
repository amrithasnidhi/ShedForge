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
    createCourse,
    deleteCourse,
    listCourses,
    updateCourse,
    type Course,
    type CourseType,
    type CourseUpdate,
} from "@/lib/academic-api";

export default function CoursesPage() {
    const { user } = useAuth();
    const canManage = user?.role === "admin" || user?.role === "scheduler";
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [courses, setCourses] = useState<Course[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [formValues, setFormValues] = useState({
        code: "",
        name: "",
        type: "theory" as CourseType,
        credits: 3,
        sections: 1,
        hours_per_week: 3,
        duration_hours: 1,
        semester_number: 1,
        batch_year: 1,
        theory_hours: 3,
        lab_hours: 0,
        tutorial_hours: 0,
    });
    const [editCourse, setEditCourse] = useState<Course | null>(null);
    const [editFormValues, setEditFormValues] = useState<CourseUpdate>({
        code: "",
        name: "",
        type: "theory",
        credits: 3,
        sections: 1,
        hours_per_week: 3,
        duration_hours: 1,
        semester_number: 1,
        batch_year: 1,
        theory_hours: 3,
        lab_hours: 0,
        tutorial_hours: 0,
    });

    useEffect(() => {
        const loadCourses = async () => {
            try {
                const data = await listCourses();
                setCourses(data);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load courses";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        void loadCourses();
    }, []);

    const deriveHoursPerWeek = (theoryHours: number, labHours: number, tutorialHours: number): number =>
        Math.max(1, theoryHours + labHours + tutorialHours);

    const handleAddCourse = async () => {
        setError(null);
        try {
            const created = await createCourse({
                ...formValues,
                credits: formValues.hours_per_week,
                faculty_id: null,
            });
            setCourses((prev) => [...prev, created]);
            setIsAddDialogOpen(false);
            setFormValues({
                code: "",
                name: "",
                type: "theory",
                credits: 3,
                sections: 1,
                hours_per_week: 3,
                duration_hours: 1,
                semester_number: 1,
                batch_year: 1,
                theory_hours: 3,
                lab_hours: 0,
                tutorial_hours: 0,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create course";
            setError(message);
        }
    };

    const handleDeleteCourse = async (courseId: string) => {
        if (!window.confirm("Delete this course?")) {
            return;
        }
        setError(null);
        try {
            await deleteCourse(courseId);
            setCourses((prev) => prev.filter((course) => course.id !== courseId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete course";
            setError(message);
        }
    };

    const openEditCourse = (course: Course) => {
        setEditCourse(course);
        setEditFormValues({
            code: course.code,
            name: course.name,
            type: course.type,
            credits: course.hours_per_week,
            sections: course.sections,
            hours_per_week: course.hours_per_week,
            duration_hours: course.duration_hours,
            semester_number: course.semester_number,
            batch_year: course.batch_year,
            theory_hours: course.theory_hours,
            lab_hours: course.lab_hours,
            tutorial_hours: course.tutorial_hours,
        });
        setIsEditDialogOpen(true);
    };

    const handleUpdateCourse = async () => {
        if (!editCourse) {
            return;
        }
        setError(null);
        try {
            const updated = await updateCourse(editCourse.id, {
                ...editFormValues,
                credits: Number(editFormValues.hours_per_week ?? 0),
            });
            setCourses((prev) => prev.map((course) => (course.id === updated.id ? updated : course)));
            setIsEditDialogOpen(false);
            setEditCourse(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to update course";
            setError(message);
        }
    };

    const filteredCourses = courses.filter((course) => {
        const matchesSearch =
            course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || course.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const courseTypes = useMemo(() => Array.from(new Set(courses.map((c) => c.type))), [courses]);
    const theoryCourses = courses.filter((c) => c.type === "theory").length;
    const labCourses = courses.filter((c) => c.type === "lab").length;
    const electiveCourses = courses.filter((c) => c.type === "elective").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Course Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage courses, sections, and scheduling requirements
                    </p>
                </div>
                {canManage && (
                    <>
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
                                        <Input
                                            id="code"
                                           
                                            value={formValues.code}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, code: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="courseName">Course Name</Label>
                                        <Input
                                            id="courseName"
                                           
                                            value={formValues.name}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="type">Course Type</Label>
                                        <Select
                                            value={formValues.type}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => {
                                                    const nextType = value as CourseType;
                                                    if (nextType === "lab") {
                                                        const nextLab = Math.max(2, prev.lab_hours || prev.hours_per_week);
                                                        return {
                                                            ...prev,
                                                            type: nextType,
                                                            theory_hours: 0,
                                                            tutorial_hours: 0,
                                                            lab_hours: nextLab,
                                                            hours_per_week: nextLab,
                                                            credits: nextLab,
                                                        };
                                                    }
                                                    const nextTheory = Math.max(1, prev.theory_hours || prev.hours_per_week);
                                                    const nextHours = deriveHoursPerWeek(nextTheory, 0, prev.tutorial_hours);
                                                    return {
                                                        ...prev,
                                                        type: nextType,
                                                        theory_hours: nextTheory,
                                                        lab_hours: 0,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                        >
                                            <SelectTrigger id="type">
                                                <SelectValue/>
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
                                        <Input
                                            id="credits"
                                            type="number"
                                            value={formValues.credits}
                                            readOnly
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="semesterNumber">Semester Number</Label>
                                        <Input
                                            id="semesterNumber"
                                            type="number"
                                            value={formValues.semester_number}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    semester_number: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="batchYear">Batch Year (1-4)</Label>
                                        <Input
                                            id="batchYear"
                                            type="number"
                                            value={formValues.batch_year}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    batch_year: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="theoryHours">Theory Hours / Week</Label>
                                        <Input
                                            id="theoryHours"
                                            type="number"
                                            value={formValues.theory_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) => {
                                                    const nextTheory = Math.max(0, Number(event.target.value));
                                                    const nextHours = deriveHoursPerWeek(
                                                        prev.type === "lab" ? 0 : nextTheory,
                                                        prev.lab_hours,
                                                        prev.tutorial_hours,
                                                    );
                                                    return {
                                                        ...prev,
                                                        theory_hours: prev.type === "lab" ? 0 : nextTheory,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                            disabled={formValues.type === "lab"}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="labHours">Lab Hours / Week</Label>
                                        <Input
                                            id="labHours"
                                            type="number"
                                            value={formValues.lab_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) => {
                                                    const nextLab = Math.max(0, Number(event.target.value));
                                                    const nextHours = deriveHoursPerWeek(
                                                        prev.theory_hours,
                                                        nextLab,
                                                        prev.tutorial_hours,
                                                    );
                                                    return {
                                                        ...prev,
                                                        lab_hours: nextLab,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="tutorialHours">Tutorial Hours / Week</Label>
                                        <Input
                                            id="tutorialHours"
                                            type="number"
                                            value={formValues.tutorial_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) => {
                                                    const nextTutorial = Math.max(0, Number(event.target.value));
                                                    const nextHours = deriveHoursPerWeek(
                                                        prev.theory_hours,
                                                        prev.lab_hours,
                                                        prev.type === "lab" ? 0 : nextTutorial,
                                                    );
                                                    return {
                                                        ...prev,
                                                        tutorial_hours: prev.type === "lab" ? 0 : nextTutorial,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                            disabled={formValues.type === "lab"}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="duration">Duration (hours)</Label>
                                        <Input
                                            id="duration"
                                            type="number"
                                           
                                            value={formValues.duration_hours}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    duration_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="sections">Number of Sections</Label>
                                        <Input
                                            id="sections"
                                            type="number"
                                           
                                            value={formValues.sections}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    sections: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="hoursPerWeek">Hours per Week</Label>
                                        <Input
                                            id="hoursPerWeek"
                                            type="number"
                                            value={formValues.hours_per_week}
                                            readOnly
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleAddCourse}>Add Course</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Edit Course</DialogTitle>
                                    <DialogDescription>Update course details and requirements</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-code">Course Code</Label>
                                        <Input
                                            id="edit-code"
                                            value={editFormValues.code ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, code: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-courseName">Course Name</Label>
                                        <Input
                                            id="edit-courseName"
                                            value={editFormValues.name ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-type">Course Type</Label>
                                        <Select
                                            value={(editFormValues.type ?? "theory") as CourseType}
                                            onValueChange={(value) =>
                                                setEditFormValues((prev) => {
                                                    const nextType = value as CourseType;
                                                    if (nextType === "lab") {
                                                        const nextLab = Math.max(2, Number(prev.lab_hours ?? prev.hours_per_week ?? 2));
                                                        return {
                                                            ...prev,
                                                            type: nextType,
                                                            theory_hours: 0,
                                                            tutorial_hours: 0,
                                                            lab_hours: nextLab,
                                                            hours_per_week: nextLab,
                                                            credits: nextLab,
                                                        };
                                                    }
                                                    const nextTheory = Math.max(1, Number(prev.theory_hours ?? prev.hours_per_week ?? 1));
                                                    const nextTutorial = Number(prev.tutorial_hours ?? 0);
                                                    const nextHours = deriveHoursPerWeek(nextTheory, 0, nextTutorial);
                                                    return {
                                                        ...prev,
                                                        type: nextType,
                                                        theory_hours: nextTheory,
                                                        lab_hours: 0,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                        >
                                            <SelectTrigger id="edit-type">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="theory">Theory</SelectItem>
                                                <SelectItem value="lab">Lab</SelectItem>
                                                <SelectItem value="elective">Elective</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-credits">Credits</Label>
                                        <Input
                                            id="edit-credits"
                                            type="number"
                                            value={editFormValues.credits ?? 0}
                                            readOnly
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-semester-number">Semester Number</Label>
                                        <Input
                                            id="edit-semester-number"
                                            type="number"
                                            value={editFormValues.semester_number ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    semester_number: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-batch-year">Batch Year (1-4)</Label>
                                        <Input
                                            id="edit-batch-year"
                                            type="number"
                                            value={editFormValues.batch_year ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    batch_year: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-theory-hours">Theory Hours / Week</Label>
                                        <Input
                                            id="edit-theory-hours"
                                            type="number"
                                            value={editFormValues.theory_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => {
                                                    const nextTheory = Math.max(0, Number(event.target.value));
                                                    const nextLab = Number(prev.lab_hours ?? 0);
                                                    const nextTutorial = Number(prev.tutorial_hours ?? 0);
                                                    const isLab = (prev.type ?? "theory") === "lab";
                                                    const finalTheory = isLab ? 0 : nextTheory;
                                                    const nextHours = deriveHoursPerWeek(finalTheory, nextLab, isLab ? 0 : nextTutorial);
                                                    return {
                                                        ...prev,
                                                        theory_hours: finalTheory,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                            disabled={(editFormValues.type ?? "theory") === "lab"}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-lab-hours">Lab Hours / Week</Label>
                                        <Input
                                            id="edit-lab-hours"
                                            type="number"
                                            value={editFormValues.lab_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => {
                                                    const nextLab = Math.max(0, Number(event.target.value));
                                                    const nextHours = deriveHoursPerWeek(
                                                        Number(prev.theory_hours ?? 0),
                                                        nextLab,
                                                        Number(prev.tutorial_hours ?? 0),
                                                    );
                                                    return {
                                                        ...prev,
                                                        lab_hours: nextLab,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-tutorial-hours">Tutorial Hours / Week</Label>
                                        <Input
                                            id="edit-tutorial-hours"
                                            type="number"
                                            value={editFormValues.tutorial_hours ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => {
                                                    const nextTutorial = Math.max(0, Number(event.target.value));
                                                    const isLab = (prev.type ?? "theory") === "lab";
                                                    const nextHours = deriveHoursPerWeek(
                                                        Number(prev.theory_hours ?? 0),
                                                        Number(prev.lab_hours ?? 0),
                                                        isLab ? 0 : nextTutorial,
                                                    );
                                                    return {
                                                        ...prev,
                                                        tutorial_hours: isLab ? 0 : nextTutorial,
                                                        hours_per_week: nextHours,
                                                        credits: nextHours,
                                                    };
                                                })
                                            }
                                            disabled={(editFormValues.type ?? "theory") === "lab"}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-duration">Duration (hours)</Label>
                                        <Input
                                            id="edit-duration"
                                            type="number"
                                            value={editFormValues.duration_hours ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    duration_hours: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-sections">Number of Sections</Label>
                                        <Input
                                            id="edit-sections"
                                            type="number"
                                            value={editFormValues.sections ?? 1}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    sections: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-hoursPerWeek">Hours per Week</Label>
                                        <Input
                                            id="edit-hoursPerWeek"
                                            type="number"
                                            value={editFormValues.hours_per_week ?? 1}
                                            readOnly
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdateCourse}>Save Changes</Button>
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
                        <CardDescription>Total Courses</CardDescription>
                        <CardTitle className="text-3xl">{courses.length}</CardTitle>
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
                               
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue/>
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

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Course Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Semester</TableHead>
                                    <TableHead className="text-right">Batch</TableHead>
                                    <TableHead className="text-right">Credits</TableHead>
                                    <TableHead>Credit Split (T/L/Tu)</TableHead>
                                    <TableHead className="text-right">Sections</TableHead>
                                    <TableHead className="text-right">Hours/Week</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                                            Loading courses...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredCourses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                                            No courses found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredCourses.map((course) => (
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
                                            <TableCell className="text-right tabular-nums">{course.semester_number}</TableCell>
                                            <TableCell className="text-right tabular-nums">Y{course.batch_year}</TableCell>
                                            <TableCell className="text-right tabular-nums">{course.credits}</TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {course.theory_hours}/{course.lab_hours}/{course.tutorial_hours}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{course.sections}</TableCell>
                                            <TableCell className="text-right tabular-nums">{course.hours_per_week}</TableCell>
                                            <TableCell className="text-right">
                                                {canManage && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => openEditCourse(course)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive"
                                                            onClick={() => handleDeleteCourse(course.id)}
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
