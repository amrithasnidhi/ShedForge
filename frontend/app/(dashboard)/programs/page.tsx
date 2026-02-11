"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Layers, Users, MoreHorizontal, GraduationCap } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { useAuth } from "@/components/auth-provider";
import {
    createProgram,
    createProgramCourse,
    createProgramElectiveGroup,
    createProgramSharedLectureGroup,
    createProgramSection,
    createProgramTerm,
    deleteProgram,
    deleteProgramCourse,
    deleteProgramElectiveGroup,
    deleteProgramSharedLectureGroup,
    deleteProgramSection,
    deleteProgramTerm,
    listCourses,
    listProgramCourses,
    listProgramElectiveGroups,
    listProgramSharedLectureGroups,
    listProgramSections,
    listProgramTerms,
    listPrograms,
    updateProgram,
    type Course,
    type Program,
    type ProgramCreate,
    type ProgramCourse,
    type ProgramCourseCreate,
    type ProgramElectiveGroup,
    type ProgramElectiveGroupCreate,
    type ProgramDegree,
    type ProgramSection,
    type ProgramSectionCreate,
    type ProgramSharedLectureGroup,
    type ProgramSharedLectureGroupCreate,
    type ProgramTerm,
    type ProgramTermCreate,
} from "@/lib/academic-api";

export default function ProgramsPage() {
    const { user } = useAuth();
    const canManage = user?.role === "admin" || user?.role === "scheduler";
    const [searchTerm, setSearchTerm] = useState("");
    const [programs, setPrograms] = useState<Program[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [structureOpen, setStructureOpen] = useState(false);
    const [activeProgram, setActiveProgram] = useState<Program | null>(null);
    const [editProgram, setEditProgram] = useState<Program | null>(null);

    const [terms, setTerms] = useState<ProgramTerm[]>([]);
    const [sections, setSections] = useState<ProgramSection[]>([]);
    const [programCourses, setProgramCourses] = useState<ProgramCourse[]>([]);
    const [electiveGroups, setElectiveGroups] = useState<ProgramElectiveGroup[]>([]);
    const [sharedLectureGroups, setSharedLectureGroups] = useState<ProgramSharedLectureGroup[]>([]);
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [structureLoading, setStructureLoading] = useState(false);
    const [structureError, setStructureError] = useState<string | null>(null);

    const [formValues, setFormValues] = useState<ProgramCreate>({
        name: "",
        code: "",
        department: "",
        degree: "BS" as ProgramDegree,
        duration_years: 4,
        sections: 1,
        total_students: 0,
    });
    const [editFormValues, setEditFormValues] = useState<ProgramCreate>({
        name: "",
        code: "",
        department: "",
        degree: "BS" as ProgramDegree,
        duration_years: 4,
        sections: 1,
        total_students: 0,
    });

    const [termForm, setTermForm] = useState<ProgramTermCreate>({
        term_number: 1,
        name: "",
        credits_required: 0,
    });

    const [sectionForm, setSectionForm] = useState<ProgramSectionCreate>({
        term_number: 1,
        name: "",
        capacity: 0,
    });

    const [courseForm, setCourseForm] = useState<ProgramCourseCreate>({
        term_number: 1,
        course_id: "",
        is_required: true,
        prerequisite_course_ids: [],
    });

    const [electiveGroupForm, setElectiveGroupForm] = useState<ProgramElectiveGroupCreate>({
        term_number: 1,
        name: "",
        program_course_ids: [],
    });
    const [sharedLectureForm, setSharedLectureForm] = useState<ProgramSharedLectureGroupCreate>({
        term_number: 1,
        name: "",
        course_id: "",
        section_names: [],
    });

    useEffect(() => {
        const loadPrograms = async () => {
            try {
                const data = await listPrograms();
                setPrograms(data);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load programs";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        void loadPrograms();
    }, []);

    const refreshStructure = async (programId: string) => {
        setStructureError(null);
        setStructureLoading(true);
        try {
            const [termData, sectionData, courseData, electiveGroupData, sharedGroupData, courseCatalog] = await Promise.all([
                listProgramTerms(programId),
                listProgramSections(programId),
                listProgramCourses(programId),
                listProgramElectiveGroups(programId),
                listProgramSharedLectureGroups(programId),
                listCourses(),
            ]);
            setTerms(termData);
            setSections(sectionData);
            setProgramCourses(courseData);
            setElectiveGroups(electiveGroupData);
            setSharedLectureGroups(sharedGroupData);
            setAllCourses(courseCatalog);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to load program structure";
            setStructureError(message);
        } finally {
            setStructureLoading(false);
        }
    };

    const handleAddProgram = async () => {
        setError(null);
        try {
            const created = await createProgram(formValues);
            setPrograms((prev) => [...prev, created]);
            setIsAddDialogOpen(false);
            setFormValues({
                name: "",
                code: "",
                department: "",
                degree: "BS",
                duration_years: 4,
                sections: 1,
                total_students: 0,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create program";
            setError(message);
        }
    };

    const handleDeleteProgram = async (programId: string) => {
        if (!window.confirm("Delete this program?")) {
            return;
        }
        setError(null);
        try {
            await deleteProgram(programId);
            setPrograms((prev) => prev.filter((program) => program.id !== programId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete program";
            setError(message);
        }
    };

    const openEditProgram = (program: Program) => {
        setEditProgram(program);
        setEditFormValues({
            name: program.name,
            code: program.code,
            department: program.department,
            degree: program.degree,
            duration_years: program.duration_years,
            sections: program.sections,
            total_students: program.total_students,
        });
        setIsEditDialogOpen(true);
    };

    const handleUpdateProgram = async () => {
        if (!editProgram) {
            return;
        }
        setError(null);
        try {
            const updated = await updateProgram(editProgram.id, editFormValues);
            setPrograms((prev) => prev.map((program) => (program.id === updated.id ? updated : program)));
            setIsEditDialogOpen(false);
            setEditProgram(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to update program";
            setError(message);
        }
    };

    const openStructure = async (program: Program) => {
        setActiveProgram(program);
        setStructureOpen(true);
        await refreshStructure(program.id);
    };

    const handleAddTerm = async () => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            const created = await createProgramTerm(activeProgram.id, termForm);
            setTerms((prev) => [...prev, created]);
            setTermForm({ term_number: termForm.term_number, name: "", credits_required: 0 });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to add term";
            setStructureError(message);
        }
    };

    const handleDeleteTerm = async (termId: string) => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            await deleteProgramTerm(activeProgram.id, termId);
            setTerms((prev) => prev.filter((term) => term.id !== termId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete term";
            setStructureError(message);
        }
    };

    const handleAddSection = async () => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            const created = await createProgramSection(activeProgram.id, sectionForm);
            setSections((prev) => [...prev, created]);
            setSectionForm({ term_number: sectionForm.term_number, name: "", capacity: 0 });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to add section";
            setStructureError(message);
        }
    };

    const handleDeleteSection = async (sectionId: string) => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            const deletedSection = sections.find((section) => section.id === sectionId);
            await deleteProgramSection(activeProgram.id, sectionId);
            setSections((prev) => prev.filter((section) => section.id !== sectionId));
            if (deletedSection) {
                setSharedLectureGroups((prev) =>
                    prev
                        .map((group) => ({
                            ...group,
                            section_names: group.section_names.filter((name) => name !== deletedSection.name),
                        }))
                        .filter((group) => group.section_names.length >= 2),
                );
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete section";
            setStructureError(message);
        }
    };

    const handleAddCourse = async () => {
        if (!activeProgram || !courseForm.course_id) {
            setStructureError("Select a course to assign.");
            return;
        }
        setStructureError(null);
        try {
            const created = await createProgramCourse(activeProgram.id, courseForm);
            setProgramCourses((prev) => [...prev, created]);
            setCourseForm({
                term_number: courseForm.term_number,
                course_id: "",
                is_required: true,
                prerequisite_course_ids: [],
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to assign course";
            setStructureError(message);
        }
    };

    const handleDeleteCourse = async (programCourseId: string) => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            const deletedProgramCourse = programCourses.find((item) => item.id === programCourseId);
            await deleteProgramCourse(activeProgram.id, programCourseId);
            setProgramCourses((prev) => prev.filter((item) => item.id !== programCourseId));
            setElectiveGroups((prev) =>
                prev
                    .map((group) => ({
                        ...group,
                        program_course_ids: group.program_course_ids.filter((id) => id !== programCourseId),
                    }))
                    .filter((group) => group.program_course_ids.length >= 2),
            );
            if (deletedProgramCourse) {
                setSharedLectureGroups((prev) =>
                    prev.filter((group) => group.course_id !== deletedProgramCourse.course_id),
                );
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to remove course";
            setStructureError(message);
        }
    };

    const handleAddElectiveGroup = async () => {
        if (!activeProgram) {
            return;
        }
        if (!electiveGroupForm.name.trim()) {
            setStructureError("Enter an elective group name.");
            return;
        }
        if ((electiveGroupForm.program_course_ids ?? []).length < 2) {
            setStructureError("Select at least two elective courses for an overlap group.");
            return;
        }
        setStructureError(null);
        try {
            const created = await createProgramElectiveGroup(activeProgram.id, electiveGroupForm);
            setElectiveGroups((prev) => [...prev, created]);
            setElectiveGroupForm({
                term_number: electiveGroupForm.term_number,
                name: "",
                program_course_ids: [],
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create elective group";
            setStructureError(message);
        }
    };

    const handleDeleteElectiveGroup = async (groupId: string) => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            await deleteProgramElectiveGroup(activeProgram.id, groupId);
            setElectiveGroups((prev) => prev.filter((group) => group.id !== groupId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete elective group";
            setStructureError(message);
        }
    };

    const handleAddSharedLectureGroup = async () => {
        if (!activeProgram) {
            return;
        }
        if (!sharedLectureForm.name.trim()) {
            setStructureError("Enter a shared lecture group name.");
            return;
        }
        if (!sharedLectureForm.course_id) {
            setStructureError("Select the course for shared lecture grouping.");
            return;
        }
        if ((sharedLectureForm.section_names ?? []).length < 2) {
            setStructureError("Select at least two sections.");
            return;
        }
        setStructureError(null);
        try {
            const created = await createProgramSharedLectureGroup(activeProgram.id, sharedLectureForm);
            setSharedLectureGroups((prev) => [...prev, created]);
            setSharedLectureForm({
                term_number: sharedLectureForm.term_number,
                name: "",
                course_id: "",
                section_names: [],
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create shared lecture group";
            setStructureError(message);
        }
    };

    const handleDeleteSharedLectureGroup = async (groupId: string) => {
        if (!activeProgram) {
            return;
        }
        setStructureError(null);
        try {
            await deleteProgramSharedLectureGroup(activeProgram.id, groupId);
            setSharedLectureGroups((prev) => prev.filter((group) => group.id !== groupId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete shared lecture group";
            setStructureError(message);
        }
    };

    const filteredPrograms = programs.filter(
        (program) =>
            program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            program.code.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const courseMap = useMemo(() => {
        const map = new Map<string, Course>();
        allCourses.forEach((course) => map.set(course.id, course));
        return map;
    }, [allCourses]);

    const programCourseMap = useMemo(() => {
        const map = new Map<string, ProgramCourse>();
        programCourses.forEach((item) => map.set(item.id, item));
        return map;
    }, [programCourses]);

    const eligiblePrerequisites = useMemo(() => {
        return programCourses
            .filter((item) => item.term_number < courseForm.term_number && item.course_id !== courseForm.course_id)
            .sort((left, right) => left.term_number - right.term_number);
    }, [courseForm.course_id, courseForm.term_number, programCourses]);

    const selectableElectiveCourses = useMemo(() => {
        return programCourses
            .filter((item) => {
                if (item.term_number !== electiveGroupForm.term_number) {
                    return false;
                }
                const course = courseMap.get(item.course_id);
                return course?.type === "elective";
            })
            .sort((left, right) => {
                const leftCourse = courseMap.get(left.course_id);
                const rightCourse = courseMap.get(right.course_id);
                const leftCode = leftCourse?.code ?? left.course_id;
                const rightCode = rightCourse?.code ?? right.course_id;
                return leftCode.localeCompare(rightCode);
            });
    }, [courseMap, electiveGroupForm.term_number, programCourses]);

    const sharedLectureCourseOptions = useMemo(() => {
        return programCourses
            .filter((item) => {
                if (item.term_number !== sharedLectureForm.term_number) {
                    return false;
                }
                const course = courseMap.get(item.course_id);
                return course?.type !== "lab";
            })
            .sort((left, right) => {
                const leftCourse = courseMap.get(left.course_id);
                const rightCourse = courseMap.get(right.course_id);
                const leftCode = leftCourse?.code ?? left.course_id;
                const rightCode = rightCourse?.code ?? right.course_id;
                return leftCode.localeCompare(rightCode);
            });
    }, [courseMap, programCourses, sharedLectureForm.term_number]);

    const sharedLectureSectionOptions = useMemo(() => {
        return sections
            .filter((section) => section.term_number === sharedLectureForm.term_number)
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [sections, sharedLectureForm.term_number]);

    useEffect(() => {
        const allowedIds = new Set(eligiblePrerequisites.map((item) => item.course_id));
        setCourseForm((prev) => ({
            ...prev,
            prerequisite_course_ids: (prev.prerequisite_course_ids ?? []).filter((courseId) => allowedIds.has(courseId)),
        }));
    }, [eligiblePrerequisites]);

    useEffect(() => {
        const allowedIds = new Set(selectableElectiveCourses.map((item) => item.id));
        setElectiveGroupForm((prev) => ({
            ...prev,
            program_course_ids: (prev.program_course_ids ?? []).filter((programCourseId) =>
                allowedIds.has(programCourseId),
            ),
        }));
    }, [selectableElectiveCourses]);

    useEffect(() => {
        const allowedCourseIds = new Set(sharedLectureCourseOptions.map((item) => item.course_id));
        const allowedSectionNames = new Set(sharedLectureSectionOptions.map((item) => item.name));
        setSharedLectureForm((prev) => ({
            ...prev,
            course_id: allowedCourseIds.has(prev.course_id) ? prev.course_id : "",
            section_names: (prev.section_names ?? []).filter((sectionName) => allowedSectionNames.has(sectionName)),
        }));
    }, [sharedLectureCourseOptions, sharedLectureSectionOptions]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Programs & Sections</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage academic programs, degrees, and student sections
                    </p>
                </div>
                {canManage && (
                    <>
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
                                        <Input
                                            id="name"
                                           
                                            className="col-span-3"
                                            value={formValues.name}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="code" className="text-right">
                                            Code
                                        </Label>
                                        <Input
                                            id="code"
                                           
                                            className="col-span-3"
                                            value={formValues.code}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, code: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="dept" className="text-right">
                                            Department
                                        </Label>
                                        <Input
                                            id="dept"
                                           
                                            className="col-span-3"
                                            value={formValues.department}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, department: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="degree" className="text-right">
                                            Degree
                                        </Label>
                                        <Select
                                            value={formValues.degree}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({ ...prev, degree: value as ProgramDegree }))
                                            }
                                        >
                                            <SelectTrigger id="degree" className="col-span-3">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BS">BS</SelectItem>
                                                <SelectItem value="MS">MS</SelectItem>
                                                <SelectItem value="PhD">PhD</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="duration" className="text-right">
                                            Duration (years)
                                        </Label>
                                        <Input
                                            id="duration"
                                            type="number"
                                            className="col-span-3"
                                            value={formValues.duration_years}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    duration_years: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="sections" className="text-right">
                                            Sections
                                        </Label>
                                        <Input
                                            id="sections"
                                            type="number"
                                            className="col-span-3"
                                            value={formValues.sections}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    sections: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="students" className="text-right">
                                            Total Students
                                        </Label>
                                        <Input
                                            id="students"
                                            type="number"
                                            className="col-span-3"
                                            value={formValues.total_students}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    total_students: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="button" onClick={handleAddProgram}>
                                        Save Program
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Edit Program</DialogTitle>
                                    <DialogDescription>
                                        Update the selected program details.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-name" className="text-right">
                                            Name
                                        </Label>
                                        <Input
                                            id="edit-name"
                                            className="col-span-3"
                                            value={editFormValues.name}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-code" className="text-right">
                                            Code
                                        </Label>
                                        <Input
                                            id="edit-code"
                                            className="col-span-3"
                                            value={editFormValues.code}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, code: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-dept" className="text-right">
                                            Department
                                        </Label>
                                        <Input
                                            id="edit-dept"
                                            className="col-span-3"
                                            value={editFormValues.department}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, department: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-degree" className="text-right">
                                            Degree
                                        </Label>
                                        <Select
                                            value={editFormValues.degree}
                                            onValueChange={(value) =>
                                                setEditFormValues((prev) => ({ ...prev, degree: value as ProgramDegree }))
                                            }
                                        >
                                            <SelectTrigger id="edit-degree" className="col-span-3">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BS">BS</SelectItem>
                                                <SelectItem value="MS">MS</SelectItem>
                                                <SelectItem value="PhD">PhD</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-duration" className="text-right">
                                            Duration (years)
                                        </Label>
                                        <Input
                                            id="edit-duration"
                                            type="number"
                                            className="col-span-3"
                                            value={editFormValues.duration_years}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    duration_years: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-sections" className="text-right">
                                            Sections
                                        </Label>
                                        <Input
                                            id="edit-sections"
                                            type="number"
                                            className="col-span-3"
                                            value={editFormValues.sections}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    sections: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-students" className="text-right">
                                            Total Students
                                        </Label>
                                        <Input
                                            id="edit-students"
                                            type="number"
                                            className="col-span-3"
                                            value={editFormValues.total_students}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    total_students: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdateProgram}>Save Changes</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
                            {programs.reduce((acc, p) => acc + p.total_students, 0)}
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
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                    Loading programs...
                                </TableCell>
                            </TableRow>
                        ) : filteredPrograms.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                    No programs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredPrograms.map((program) => (
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
                                            <span>{program.total_students}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {canManage ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEditProgram(program)}>
                                                        Edit Program
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openStructure(program)}>
                                                        Manage Structure
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-destructive"
                                                        onClick={() => handleDeleteProgram(program.id)}
                                                    >
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={structureOpen} onOpenChange={setStructureOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Program Structure</DialogTitle>
                        <DialogDescription>
                            {activeProgram ? `${activeProgram.name} (${activeProgram.code})` : ""}
                        </DialogDescription>
                    </DialogHeader>

                    {structureError ? (
                        <p className="text-sm text-destructive">{structureError}</p>
                    ) : null}

                    {structureLoading ? (
                        <p className="text-sm text-muted-foreground">Loading structure...</p>
                    ) : (
                        <div className="grid gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Terms</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <div className="space-y-2">
                                            <Label>Term #</Label>
                                            <Input
                                                type="number"
                                                value={termForm.term_number}
                                                onChange={(event) =>
                                                    setTermForm((prev) => ({
                                                        ...prev,
                                                        term_number: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Name</Label>
                                            <Input
                                                value={termForm.name}
                                                onChange={(event) =>
                                                    setTermForm((prev) => ({ ...prev, name: event.target.value }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Credits</Label>
                                            <Input
                                                type="number"
                                                value={termForm.credits_required}
                                                onChange={(event) =>
                                                    setTermForm((prev) => ({
                                                        ...prev,
                                                        credits_required: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <Button type="button" onClick={handleAddTerm}>
                                        Add Term
                                    </Button>
                                    {terms.length ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Term</TableHead>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead>Credits</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {terms.map((term) => (
                                                    <TableRow key={term.id}>
                                                        <TableCell>{term.term_number}</TableCell>
                                                        <TableCell>{term.name}</TableCell>
                                                        <TableCell>{term.credits_required}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive"
                                                                onClick={() => handleDeleteTerm(term.id)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No terms added yet.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Sections</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <div className="space-y-2">
                                            <Label>Term #</Label>
                                            <Input
                                                type="number"
                                                value={sectionForm.term_number}
                                                onChange={(event) =>
                                                    setSectionForm((prev) => ({
                                                        ...prev,
                                                        term_number: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Section</Label>
                                            <Input
                                                value={sectionForm.name}
                                                onChange={(event) =>
                                                    setSectionForm((prev) => ({ ...prev, name: event.target.value }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Capacity</Label>
                                            <Input
                                                type="number"
                                                value={sectionForm.capacity}
                                                onChange={(event) =>
                                                    setSectionForm((prev) => ({
                                                        ...prev,
                                                        capacity: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <Button type="button" onClick={handleAddSection}>
                                        Add Section
                                    </Button>
                                    {sections.length ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Term</TableHead>
                                                    <TableHead>Section</TableHead>
                                                    <TableHead>Capacity</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sections.map((section) => (
                                                    <TableRow key={section.id}>
                                                        <TableCell>{section.term_number}</TableCell>
                                                        <TableCell>{section.name}</TableCell>
                                                        <TableCell>{section.capacity}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive"
                                                                onClick={() => handleDeleteSection(section.id)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No sections added yet.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Courses</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <div className="space-y-2">
                                            <Label>Term #</Label>
                                            <Input
                                                type="number"
                                                value={courseForm.term_number}
                                                onChange={(event) =>
                                                    setCourseForm((prev) => ({
                                                        ...prev,
                                                        term_number: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Course</Label>
                                            <Select
                                                value={courseForm.course_id}
                                                onValueChange={(value) =>
                                                    setCourseForm((prev) => ({ ...prev, course_id: value }))
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {allCourses.map((course) => (
                                                        <SelectItem key={course.id} value={course.id}>
                                                            {course.code} - {course.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-2 pt-7">
                                            <Checkbox
                                                id="required"
                                                checked={courseForm.is_required}
                                                onCheckedChange={(checked) =>
                                                    setCourseForm((prev) => ({
                                                        ...prev,
                                                        is_required: Boolean(checked),
                                                    }))
                                                }
                                            />
                                            <Label htmlFor="required" className="text-sm">
                                                Required
                                            </Label>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Prerequisites (from earlier terms)</Label>
                                        {eligiblePrerequisites.length ? (
                                            <div className="grid gap-2 md:grid-cols-2 border rounded-md p-3">
                                                {eligiblePrerequisites.map((item) => {
                                                    const course = courseMap.get(item.course_id);
                                                    const checked = (courseForm.prerequisite_course_ids ?? []).includes(item.course_id);
                                                    return (
                                                        <label
                                                            key={item.id}
                                                            className="flex items-center gap-2 text-sm cursor-pointer"
                                                        >
                                                            <Checkbox
                                                                checked={checked}
                                                                onCheckedChange={(value) =>
                                                                    setCourseForm((prev) => {
                                                                        const selected = new Set(prev.prerequisite_course_ids ?? []);
                                                                        if (value) {
                                                                            selected.add(item.course_id);
                                                                        } else {
                                                                            selected.delete(item.course_id);
                                                                        }
                                                                        return {
                                                                            ...prev,
                                                                            prerequisite_course_ids: Array.from(selected),
                                                                        };
                                                                    })
                                                                }
                                                            />
                                                            <span>
                                                                T{item.term_number}: {course ? `${course.code} - ${course.name}` : item.course_id}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No earlier term courses available for prerequisites.
                                            </p>
                                        )}
                                    </div>
                                    <Button type="button" onClick={handleAddCourse}>
                                        Assign Course
                                    </Button>
                                    {programCourses.length ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Term</TableHead>
                                                    <TableHead>Course</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Prerequisites</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {programCourses.map((item) => {
                                                    const course = courseMap.get(item.course_id);
                                                    return (
                                                        <TableRow key={item.id}>
                                                            <TableCell>{item.term_number}</TableCell>
                                                            <TableCell>
                                                                {course ? `${course.code} - ${course.name}` : item.course_id}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={item.is_required ? "secondary" : "outline"}>
                                                                    {item.is_required ? "Required" : "Elective"}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {item.prerequisite_course_ids?.length ? (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {item.prerequisite_course_ids.map((courseId) => {
                                                                            const prerequisite = courseMap.get(courseId);
                                                                            return (
                                                                                <Badge key={`${item.id}-${courseId}`} variant="outline">
                                                                                    {prerequisite?.code ?? courseId}
                                                                                </Badge>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-sm text-muted-foreground">None</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive"
                                                                    onClick={() => handleDeleteCourse(item.id)}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No courses assigned yet.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Elective Overlap Groups</CardTitle>
                                    <CardDescription>
                                        Courses in the same group cannot run at the same time.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <div className="space-y-2">
                                            <Label>Term #</Label>
                                            <Input
                                                type="number"
                                                value={electiveGroupForm.term_number}
                                                onChange={(event) =>
                                                    setElectiveGroupForm((prev) => ({
                                                        ...prev,
                                                        term_number: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-3">
                                            <Label>Group Name</Label>
                                            <Input
                                               
                                                value={electiveGroupForm.name}
                                                onChange={(event) =>
                                                    setElectiveGroupForm((prev) => ({ ...prev, name: event.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Elective Courses in Group</Label>
                                        {selectableElectiveCourses.length ? (
                                            <div className="grid gap-2 md:grid-cols-2 border rounded-md p-3">
                                                {selectableElectiveCourses.map((item) => {
                                                    const course = courseMap.get(item.course_id);
                                                    const checked = (electiveGroupForm.program_course_ids ?? []).includes(item.id);
                                                    return (
                                                        <label
                                                            key={item.id}
                                                            className="flex items-center gap-2 text-sm cursor-pointer"
                                                        >
                                                            <Checkbox
                                                                checked={checked}
                                                                onCheckedChange={(value) =>
                                                                    setElectiveGroupForm((prev) => {
                                                                        const selected = new Set(prev.program_course_ids ?? []);
                                                                        if (value) {
                                                                            selected.add(item.id);
                                                                        } else {
                                                                            selected.delete(item.id);
                                                                        }
                                                                        return {
                                                                            ...prev,
                                                                            program_course_ids: Array.from(selected),
                                                                        };
                                                                    })
                                                                }
                                                            />
                                                            <span>
                                                                {course ? `${course.code} - ${course.name}` : item.course_id}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No elective courses are assigned for this term yet.
                                            </p>
                                        )}
                                    </div>

                                    <Button type="button" onClick={handleAddElectiveGroup}>
                                        Add Overlap Group
                                    </Button>

                                    {electiveGroups.length ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Term</TableHead>
                                                    <TableHead>Group</TableHead>
                                                    <TableHead>Courses</TableHead>
                                                    <TableHead>Policy</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {electiveGroups.map((group) => (
                                                    <TableRow key={group.id}>
                                                        <TableCell>{group.term_number}</TableCell>
                                                        <TableCell>{group.name}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {group.program_course_ids.map((programCourseId) => {
                                                                    const programCourse = programCourseMap.get(programCourseId);
                                                                    const course = programCourse
                                                                        ? courseMap.get(programCourse.course_id)
                                                                        : undefined;
                                                                    return (
                                                                        <Badge key={`${group.id}-${programCourseId}`} variant="outline">
                                                                            {course?.code ?? programCourseId}
                                                                        </Badge>
                                                                    );
                                                                })}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary">{group.conflict_policy}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive"
                                                                onClick={() => handleDeleteElectiveGroup(group.id)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No elective overlap groups created yet.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Shared Lecture Groups</CardTitle>
                                    <CardDescription>
                                        Group sections to run one combined lecture event for a course.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <div className="space-y-2">
                                            <Label>Term #</Label>
                                            <Input
                                                type="number"
                                                value={sharedLectureForm.term_number}
                                                onChange={(event) =>
                                                    setSharedLectureForm((prev) => ({
                                                        ...prev,
                                                        term_number: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-3">
                                            <Label>Group Name</Label>
                                            <Input
                                               
                                                value={sharedLectureForm.name}
                                                onChange={(event) =>
                                                    setSharedLectureForm((prev) => ({ ...prev, name: event.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Course</Label>
                                        <Select
                                            value={sharedLectureForm.course_id}
                                            onValueChange={(value) =>
                                                setSharedLectureForm((prev) => ({ ...prev, course_id: value }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {sharedLectureCourseOptions.map((item) => {
                                                    const course = courseMap.get(item.course_id);
                                                    return (
                                                        <SelectItem key={item.id} value={item.course_id}>
                                                            {course ? `${course.code} - ${course.name}` : item.course_id}
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Sections</Label>
                                        {sharedLectureSectionOptions.length ? (
                                            <div className="grid gap-2 md:grid-cols-3 border rounded-md p-3">
                                                {sharedLectureSectionOptions.map((section) => {
                                                    const checked = (sharedLectureForm.section_names ?? []).includes(section.name);
                                                    return (
                                                        <label
                                                            key={section.id}
                                                            className="flex items-center gap-2 text-sm cursor-pointer"
                                                        >
                                                            <Checkbox
                                                                checked={checked}
                                                                onCheckedChange={(value) =>
                                                                    setSharedLectureForm((prev) => {
                                                                        const selected = new Set(prev.section_names ?? []);
                                                                        if (value) {
                                                                            selected.add(section.name);
                                                                        } else {
                                                                            selected.delete(section.name);
                                                                        }
                                                                        return {
                                                                            ...prev,
                                                                            section_names: Array.from(selected),
                                                                        };
                                                                    })
                                                                }
                                                            />
                                                            <span>{section.name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No sections available for this term yet.
                                            </p>
                                        )}
                                    </div>

                                    <Button type="button" onClick={handleAddSharedLectureGroup}>
                                        Add Shared Lecture Group
                                    </Button>

                                    {sharedLectureGroups.length ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Term</TableHead>
                                                    <TableHead>Group</TableHead>
                                                    <TableHead>Course</TableHead>
                                                    <TableHead>Sections</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sharedLectureGroups.map((group) => {
                                                    const course = courseMap.get(group.course_id);
                                                    return (
                                                        <TableRow key={group.id}>
                                                            <TableCell>{group.term_number}</TableCell>
                                                            <TableCell>{group.name}</TableCell>
                                                            <TableCell>
                                                                {course ? `${course.code} - ${course.name}` : group.course_id}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {group.section_names.map((sectionName) => (
                                                                        <Badge key={`${group.id}-${sectionName}`} variant="outline">
                                                                            {sectionName}
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive"
                                                                    onClick={() => handleDeleteSharedLectureGroup(group.id)}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No shared lecture groups created yet.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
