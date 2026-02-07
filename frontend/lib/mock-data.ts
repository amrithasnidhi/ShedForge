// Mock data for University Scheduling Application

export interface Faculty {
  id: string;
  name: string;
  department: string;
  workloadHours: number;
  maxHours: number;
  availability: string[];
  email: string;
  currentWorkload?: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  type: "theory" | "lab" | "elective";
  credits: number;
  facultyId: string;
  duration: number; // in hours
  sections?: number;
  hoursPerWeek: number;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  type: "lecture" | "lab" | "seminar";
  building: string;
  hasLabEquipment?: boolean;
  utilization?: number;
  hasProjector?: boolean;
}

export interface TimeSlot {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  courseId: string;
  roomId: string;
  facultyId: string;
  section: string;
}

export interface Conflict {
  id: string;
  type: "faculty-overlap" | "room-overlap" | "capacity" | "availability";
  severity: "high" | "medium" | "low";
  description: string;
  affectedSlots: string[];
  resolution: string;
  resolved: boolean;
}

export interface ConstraintStatus {
  name: string;
  description: string;
  satisfaction: number;
  status: "satisfied" | "partial" | "violated";
}

// Faculty Data
export const facultyData: Faculty[] = [
  { id: "f1", name: "Dr. Sarah Mitchell", department: "Computer Science", workloadHours: 18, maxHours: 20, availability: ["Mon", "Tue", "Wed", "Thu"], email: "sarah.mitchell@university.edu" },
  { id: "f2", name: "Prof. James Chen", department: "Computer Science", workloadHours: 16, maxHours: 20, availability: ["Mon", "Tue", "Wed", "Fri"], email: "james.chen@university.edu" },
  { id: "f3", name: "Dr. Emily Watson", department: "Mathematics", workloadHours: 20, maxHours: 20, availability: ["Mon", "Tue", "Thu", "Fri"], email: "emily.watson@university.edu" },
  { id: "f4", name: "Prof. Michael Brown", department: "Physics", workloadHours: 14, maxHours: 20, availability: ["Tue", "Wed", "Thu", "Fri"], email: "michael.brown@university.edu" },
  { id: "f5", name: "Dr. Lisa Anderson", department: "Electronics", workloadHours: 22, maxHours: 20, availability: ["Mon", "Wed", "Thu", "Fri"], email: "lisa.anderson@university.edu" },
  { id: "f6", name: "Prof. David Kim", department: "Computer Science", workloadHours: 15, maxHours: 20, availability: ["Mon", "Tue", "Wed", "Thu", "Fri"], email: "david.kim@university.edu" },
  { id: "f7", name: "Dr. Rachel Green", department: "Mathematics", workloadHours: 17, maxHours: 20, availability: ["Tue", "Wed", "Thu"], email: "rachel.green@university.edu" },
  { id: "f8", name: "Prof. Thomas Lee", department: "Physics", workloadHours: 19, maxHours: 20, availability: ["Mon", "Tue", "Fri"], email: "thomas.lee@university.edu" },
];

// Course Data
export const courseData: Course[] = [
  { id: "c1", code: "CS101", name: "Data Structures", type: "theory", credits: 4, facultyId: "f1", duration: 3, hoursPerWeek: 4 },
  { id: "c2", code: "CS102", name: "Algorithms Lab", type: "lab", credits: 2, facultyId: "f1", duration: 3, hoursPerWeek: 3 },
  { id: "c3", code: "CS201", name: "Database Systems", type: "theory", credits: 4, facultyId: "f2", duration: 3, hoursPerWeek: 4 },
  { id: "c4", code: "CS301", name: "Machine Learning", type: "elective", credits: 3, facultyId: "f6", duration: 2, hoursPerWeek: 3 },
  { id: "c5", code: "MA101", name: "Linear Algebra", type: "theory", credits: 4, facultyId: "f3", duration: 3, hoursPerWeek: 4 },
  { id: "c6", code: "MA201", name: "Probability & Statistics", type: "theory", credits: 3, facultyId: "f7", duration: 2, hoursPerWeek: 3 },
  { id: "c7", code: "PH101", name: "Classical Mechanics", type: "theory", credits: 4, facultyId: "f4", duration: 3, hoursPerWeek: 4 },
  { id: "c8", code: "PH102", name: "Physics Lab", type: "lab", credits: 2, facultyId: "f8", duration: 3, hoursPerWeek: 3 },
  { id: "c9", code: "EC101", name: "Digital Electronics", type: "theory", credits: 4, facultyId: "f5", duration: 3, hoursPerWeek: 4 },
  { id: "c10", code: "EC102", name: "Electronics Lab", type: "lab", credits: 2, facultyId: "f5", duration: 3, hoursPerWeek: 3 },
];

// Room Data
export const roomData: Room[] = [
  { id: "r1", name: "LH-101", capacity: 120, type: "lecture", building: "Main Block", hasProjector: true, hasLabEquipment: false },
  { id: "r2", name: "LH-102", capacity: 80, type: "lecture", building: "Main Block", hasProjector: true, hasLabEquipment: false },
  { id: "r3", name: "LH-201", capacity: 60, type: "lecture", building: "Academic Block", hasProjector: true, hasLabEquipment: false },
  { id: "r4", name: "Lab-A1", capacity: 40, type: "lab", building: "Tech Block", hasProjector: true, hasLabEquipment: true },
  { id: "r5", name: "Lab-A2", capacity: 40, type: "lab", building: "Tech Block", hasProjector: false, hasLabEquipment: true },
  { id: "r6", name: "Lab-B1", capacity: 30, type: "lab", building: "Science Block", hasProjector: false, hasLabEquipment: true },
  { id: "r7", name: "SR-101", capacity: 30, type: "seminar", building: "Main Block", hasProjector: true, hasLabEquipment: false },
];

// Generated Timetable Slots
export const timetableData: TimeSlot[] = [
  { id: "ts1", day: "Monday", startTime: "09:00", endTime: "10:00", courseId: "c1", roomId: "r1", facultyId: "f1", section: "A" },
  { id: "ts2", day: "Monday", startTime: "10:00", endTime: "11:00", courseId: "c1", roomId: "r1", facultyId: "f1", section: "A" },
  { id: "ts3", day: "Monday", startTime: "11:00", endTime: "12:00", courseId: "c5", roomId: "r2", facultyId: "f3", section: "A" },
  { id: "ts4", day: "Monday", startTime: "14:00", endTime: "15:00", courseId: "c2", roomId: "r4", facultyId: "f1", section: "A" },
  { id: "ts5", day: "Monday", startTime: "15:00", endTime: "16:00", courseId: "c2", roomId: "r4", facultyId: "f1", section: "A" },
  { id: "ts6", day: "Monday", startTime: "16:00", endTime: "17:00", courseId: "c2", roomId: "r4", facultyId: "f1", section: "A" },
  { id: "ts7", day: "Tuesday", startTime: "09:00", endTime: "10:00", courseId: "c3", roomId: "r2", facultyId: "f2", section: "A" },
  { id: "ts8", day: "Tuesday", startTime: "10:00", endTime: "11:00", courseId: "c3", roomId: "r2", facultyId: "f2", section: "A" },
  { id: "ts9", day: "Tuesday", startTime: "11:00", endTime: "12:00", courseId: "c7", roomId: "r1", facultyId: "f4", section: "A" },
  { id: "ts10", day: "Tuesday", startTime: "14:00", endTime: "15:00", courseId: "c8", roomId: "r6", facultyId: "f8", section: "A" },
  { id: "ts11", day: "Tuesday", startTime: "15:00", endTime: "16:00", courseId: "c8", roomId: "r6", facultyId: "f8", section: "A" },
  { id: "ts12", day: "Wednesday", startTime: "09:00", endTime: "10:00", courseId: "c9", roomId: "r3", facultyId: "f5", section: "A" },
  { id: "ts13", day: "Wednesday", startTime: "10:00", endTime: "11:00", courseId: "c9", roomId: "r3", facultyId: "f5", section: "A" },
  { id: "ts14", day: "Wednesday", startTime: "11:00", endTime: "12:00", courseId: "c4", roomId: "r7", facultyId: "f6", section: "A" },
  { id: "ts15", day: "Wednesday", startTime: "14:00", endTime: "15:00", courseId: "c10", roomId: "r5", facultyId: "f5", section: "A" },
  { id: "ts16", day: "Wednesday", startTime: "15:00", endTime: "16:00", courseId: "c10", roomId: "r5", facultyId: "f5", section: "A" },
  { id: "ts17", day: "Thursday", startTime: "09:00", endTime: "10:00", courseId: "c1", roomId: "r1", facultyId: "f1", section: "A" },
  { id: "ts18", day: "Thursday", startTime: "10:00", endTime: "11:00", courseId: "c6", roomId: "r3", facultyId: "f7", section: "A" },
  { id: "ts19", day: "Thursday", startTime: "11:00", endTime: "12:00", courseId: "c6", roomId: "r3", facultyId: "f7", section: "A" },
  { id: "ts20", day: "Thursday", startTime: "14:00", endTime: "15:00", courseId: "c3", roomId: "r2", facultyId: "f2", section: "A" },
  { id: "ts21", day: "Friday", startTime: "09:00", endTime: "10:00", courseId: "c5", roomId: "r2", facultyId: "f3", section: "A" },
  { id: "ts22", day: "Friday", startTime: "10:00", endTime: "11:00", courseId: "c5", roomId: "r2", facultyId: "f3", section: "A" },
  { id: "ts23", day: "Friday", startTime: "11:00", endTime: "12:00", courseId: "c7", roomId: "r1", facultyId: "f4", section: "A" },
  { id: "ts24", day: "Friday", startTime: "14:00", endTime: "15:00", courseId: "c4", roomId: "r7", facultyId: "f6", section: "A" },
];

// Constraint Status Data
export const constraintData: ConstraintStatus[] = [
  { name: "Faculty Availability", description: "Respects faculty preferred time slots", satisfaction: 98, status: "satisfied" },
  { name: "Lab Continuity", description: "Lab sessions scheduled in consecutive slots", satisfaction: 100, status: "satisfied" },
  { name: "Room Capacity", description: "Room capacity matches section strength", satisfaction: 95, status: "satisfied" },
  { name: "Elective Overlap", description: "No elective conflicts within same semester", satisfaction: 100, status: "satisfied" },
  { name: "Workload Balance", description: "Faculty workload within acceptable limits", satisfaction: 87, status: "partial" },
  { name: "Break Time", description: "Minimum break between consecutive classes", satisfaction: 92, status: "satisfied" },
];

// Conflict Data
export const conflictData: Conflict[] = [
  {
    id: "conf1",
    type: "faculty-overlap",
    severity: "medium",
    description: "Dr. Lisa Anderson scheduled for two classes at the same time on Wednesday",
    affectedSlots: ["ts12", "ts15"],
    resolution: "Move EC102 Lab to Thursday 14:00-16:00",
    resolved: false,
  },
  {
    id: "conf2",
    type: "capacity",
    severity: "low",
    description: "LH-201 capacity (60) is close to section strength (58)",
    affectedSlots: ["ts18"],
    resolution: "Consider moving to LH-102 for better comfort",
    resolved: false,
  },
];

// Optimization Summary
export const optimizationSummary = {
  constraintSatisfaction: 95.3,
  conflictsDetected: 2,
  optimizationTechnique: "Genetic Algorithm with Local Search",
  alternativesGenerated: 5,
  lastGenerated: "2026-02-02T10:30:00",
  totalIterations: 1250,
  computeTime: "4.2 seconds",
};

// Workload Analytics Data
export const workloadChartData = facultyData.map((f) => ({
  name: f.name.split(" ").slice(-1)[0],
  fullName: f.name,
  workload: f.workloadHours,
  max: f.maxHours,
  department: f.department,
  overloaded: f.workloadHours > f.maxHours,
}));

// Daily workload distribution for heatmap
export const dailyWorkloadData = [
  { day: "Monday", f1: 4, f2: 0, f3: 2, f4: 0, f5: 0, f6: 0, f7: 0, f8: 0 },
  { day: "Tuesday", f1: 0, f2: 4, f3: 0, f4: 2, f5: 0, f6: 0, f7: 0, f8: 3 },
  { day: "Wednesday", f1: 0, f2: 0, f3: 0, f4: 0, f5: 5, f6: 2, f7: 0, f8: 0 },
  { day: "Thursday", f1: 2, f2: 2, f3: 0, f4: 0, f5: 0, f6: 0, f7: 3, f8: 0 },
  { day: "Friday", f1: 0, f2: 0, f3: 4, f4: 2, f5: 0, f6: 2, f7: 0, f8: 0 },
];

// Performance trend data
export const performanceTrendData = [
  { semester: "Fall 2024", satisfaction: 89, conflicts: 8 },
  { semester: "Spring 2025", satisfaction: 92, conflicts: 5 },
  { semester: "Fall 2025", satisfaction: 94, conflicts: 3 },
  { semester: "Spring 2026", satisfaction: 95.3, conflicts: 2 },
];

// Helper function to get course by ID
export function getCourseById(id: string): Course | undefined {
  return courseData.find((c) => c.id === id);
}

// Helper function to get faculty by ID
export function getFacultyById(id: string): Faculty | undefined {
  return facultyData.find((f) => f.id === id);
}

// Helper function to get room by ID
export function getRoomById(id: string): Room | undefined {
  return roomData.find((r) => r.id === id);
}

// Generate ICS content for calendar export
export function generateICSContent(slots: TimeSlot[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//University Scheduler//EN",
  ];

  slots.forEach((slot) => {
    const course = getCourseById(slot.courseId);
    const room = getRoomById(slot.roomId);
    const faculty = getFacultyById(slot.facultyId);

    if (course && room && faculty) {
      lines.push("BEGIN:VEVENT");
      lines.push(`SUMMARY:${course.code} - ${course.name}`);
      lines.push(`DESCRIPTION:Instructor: ${faculty.name}\\nSection: ${slot.section}`);
      lines.push(`LOCATION:${room.name}, ${room.building}`);
      lines.push("END:VEVENT");
    }
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
