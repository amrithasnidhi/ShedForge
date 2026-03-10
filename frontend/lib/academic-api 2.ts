const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }
  const token = localStorage.getItem("token");
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    let detail = errorMessage;
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export type ProgramDegree = "BS" | "MS" | "PhD";

export interface Program {
  id: string;
  name: string;
  code: string;
  department: string;
  degree: ProgramDegree;
  duration_years: number;
  sections: number;
  total_students: number;
}

export type ProgramCreate = Omit<Program, "id">;
export type ProgramUpdate = Partial<ProgramCreate>;

export async function listPrograms(): Promise<Program[]> {
  const response = await fetch(`${API_BASE_URL}/api/programs`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Program[]>(response, "Unable to load programs");
}

export async function createProgram(payload: ProgramCreate): Promise<Program> {
  const response = await fetch(`${API_BASE_URL}/api/programs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<Program>(response, "Unable to create program");
}

export async function deleteProgram(programId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete program");
  }
}

export async function updateProgram(programId: string, payload: ProgramUpdate): Promise<Program> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<Program>(response, "Unable to update program");
}

export interface ProgramTerm {
  id: string;
  term_number: number;
  name: string;
  credits_required: number;
}

export type ProgramTermCreate = Omit<ProgramTerm, "id">;

export async function listProgramTerms(programId: string): Promise<ProgramTerm[]> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/terms`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramTerm[]>(response, "Unable to load program terms");
}

export async function createProgramTerm(programId: string, payload: ProgramTermCreate): Promise<ProgramTerm> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/terms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<ProgramTerm>(response, "Unable to create program term");
}

export async function deleteProgramTerm(programId: string, termId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/terms/${termId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete program term");
  }
}

export interface ProgramSection {
  id: string;
  term_number: number;
  name: string;
  capacity: number;
}

export type ProgramSectionCreate = Omit<ProgramSection, "id">;

export async function listProgramSections(programId: string): Promise<ProgramSection[]> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/sections`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramSection[]>(response, "Unable to load program sections");
}

export async function createProgramSection(
  programId: string,
  payload: ProgramSectionCreate,
): Promise<ProgramSection> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<ProgramSection>(response, "Unable to create program section");
}

export async function deleteProgramSection(programId: string, sectionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/sections/${sectionId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete program section");
  }
}

export interface ProgramCourse {
  id: string;
  term_number: number;
  course_id: string;
  is_required: boolean;
  lab_batch_count: number;
  allow_parallel_batches: boolean;
  prerequisite_course_ids: string[];
}

export type ProgramCourseCreate = Omit<ProgramCourse, "id" | "lab_batch_count" | "allow_parallel_batches"> & {
  lab_batch_count?: number;
  allow_parallel_batches?: boolean;
  prerequisite_course_ids?: string[];
};

export async function listProgramCourses(programId: string): Promise<ProgramCourse[]> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/courses`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramCourse[]>(response, "Unable to load program courses");
}

export async function createProgramCourse(
  programId: string,
  payload: ProgramCourseCreate,
): Promise<ProgramCourse> {
  const body = {
    ...payload,
    lab_batch_count: payload.lab_batch_count ?? 1,
    allow_parallel_batches: payload.allow_parallel_batches ?? true,
    prerequisite_course_ids: payload.prerequisite_course_ids ?? [],
  };
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse<ProgramCourse>(response, "Unable to assign program course");
}

export async function deleteProgramCourse(programId: string, programCourseId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/courses/${programCourseId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete program course");
  }
}

export type ElectiveConflictPolicy = "no_overlap";

export interface ProgramElectiveGroup {
  id: string;
  term_number: number;
  name: string;
  conflict_policy: ElectiveConflictPolicy;
  program_course_ids: string[];
}

export type ProgramElectiveGroupCreate = Omit<ProgramElectiveGroup, "id" | "conflict_policy"> & {
  conflict_policy?: ElectiveConflictPolicy;
};

export type ProgramElectiveGroupUpdate = ProgramElectiveGroupCreate;

export async function listProgramElectiveGroups(
  programId: string,
  termNumber?: number,
): Promise<ProgramElectiveGroup[]> {
  const query = typeof termNumber === "number" ? `?term_number=${termNumber}` : "";
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/elective-groups${query}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramElectiveGroup[]>(response, "Unable to load elective groups");
}

export async function createProgramElectiveGroup(
  programId: string,
  payload: ProgramElectiveGroupCreate,
): Promise<ProgramElectiveGroup> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/elective-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({
      conflict_policy: "no_overlap",
      ...payload,
    }),
  });
  return handleResponse<ProgramElectiveGroup>(response, "Unable to create elective group");
}

export async function updateProgramElectiveGroup(
  programId: string,
  groupId: string,
  payload: ProgramElectiveGroupUpdate,
): Promise<ProgramElectiveGroup> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/elective-groups/${groupId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({
      conflict_policy: "no_overlap",
      ...payload,
    }),
  });
  return handleResponse<ProgramElectiveGroup>(response, "Unable to update elective group");
}

export async function deleteProgramElectiveGroup(programId: string, groupId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/elective-groups/${groupId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete elective group");
  }
}

export interface ProgramSharedLectureGroup {
  id: string;
  term_number: number;
  name: string;
  course_id: string;
  section_names: string[];
}

export type ProgramSharedLectureGroupCreate = Omit<ProgramSharedLectureGroup, "id">;
export type ProgramSharedLectureGroupUpdate = ProgramSharedLectureGroupCreate;

export async function listProgramSharedLectureGroups(
  programId: string,
  termNumber?: number,
): Promise<ProgramSharedLectureGroup[]> {
  const query = typeof termNumber === "number" ? `?term_number=${termNumber}` : "";
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/shared-lecture-groups${query}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<ProgramSharedLectureGroup[]>(response, "Unable to load shared lecture groups");
}

export async function createProgramSharedLectureGroup(
  programId: string,
  payload: ProgramSharedLectureGroupCreate,
): Promise<ProgramSharedLectureGroup> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/shared-lecture-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<ProgramSharedLectureGroup>(response, "Unable to create shared lecture group");
}

export async function updateProgramSharedLectureGroup(
  programId: string,
  groupId: string,
  payload: ProgramSharedLectureGroupUpdate,
): Promise<ProgramSharedLectureGroup> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/shared-lecture-groups/${groupId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<ProgramSharedLectureGroup>(response, "Unable to update shared lecture group");
}

export async function deleteProgramSharedLectureGroup(programId: string, groupId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/programs/${programId}/shared-lecture-groups/${groupId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete shared lecture group");
  }
}

export type CourseType = "theory" | "lab" | "elective";

export interface Course {
  id: string;
  code: string;
  name: string;
  type: CourseType;
  credits: number;
  duration_hours: number;
  sections: number;
  hours_per_week: number;
   semester_number: number;
   batch_year: number;
   theory_hours: number;
   lab_hours: number;
   tutorial_hours: number;
  faculty_id?: string | null;
}

export type CourseCreate = Omit<Course, "id">;
export type CourseUpdate = Partial<CourseCreate>;

export async function listCourses(): Promise<Course[]> {
  const response = await fetch(`${API_BASE_URL}/api/courses`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Course[]>(response, "Unable to load courses");
}

export async function createCourse(payload: CourseCreate): Promise<Course> {
  const response = await fetch(`${API_BASE_URL}/api/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<Course>(response, "Unable to create course");
}

export async function deleteCourse(courseId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete course");
  }
}

export async function updateCourse(courseId: string, payload: CourseUpdate): Promise<Course> {
  const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<Course>(response, "Unable to update course");
}

export type RoomType = "lecture" | "lab" | "seminar";

export interface Room {
  id: string;
  name: string;
  building: string;
  capacity: number;
  type: RoomType;
  has_lab_equipment: boolean;
  has_projector: boolean;
  availability_windows: Array<{ day: string; start_time: string; end_time: string }>;
}

export type RoomCreate = Omit<Room, "id" | "availability_windows"> & {
  availability_windows?: Array<{ day: string; start_time: string; end_time: string }>;
};
export type RoomUpdate = Partial<RoomCreate>;

export async function listRooms(): Promise<Room[]> {
  const response = await fetch(`${API_BASE_URL}/api/rooms`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Room[]>(response, "Unable to load rooms");
}

export async function createRoom(payload: RoomCreate): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({
      availability_windows: [],
      ...payload,
    }),
  });
  return handleResponse<Room>(response, "Unable to create room");
}

export async function deleteRoom(roomId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete room");
  }
}

export async function updateRoom(roomId: string, payload: RoomUpdate): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<Room>(response, "Unable to update room");
}

export interface Faculty {
  id: string;
  name: string;
  designation: string;
  email: string;
  department: string;
  workload_hours: number;
  max_hours: number;
  availability: string[];
  availability_windows: Array<{ day: string; start_time: string; end_time: string }>;
  avoid_back_to_back: boolean;
  preferred_min_break_minutes: number;
  preference_notes?: string | null;
  preferred_subject_codes: string[];
  semester_preferences: Record<string, string[]>;
}

export interface FacultyCreate {
  name: string;
  email: string;
  department: string;
  max_hours: number;
  designation?: string;
  workload_hours?: number;
  availability?: string[];
  availability_windows?: Array<{ day: string; start_time: string; end_time: string }>;
  avoid_back_to_back?: boolean;
  preferred_min_break_minutes?: number;
  preference_notes?: string | null;
  preferred_subject_codes?: string[];
  semester_preferences?: Record<string, string[]>;
}

export type FacultyUpdate = Partial<Omit<Faculty, "id">>;

export async function listFaculty(): Promise<Faculty[]> {
  const response = await fetch(`${API_BASE_URL}/api/faculty`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Faculty[]>(response, "Unable to load faculty");
}

export async function getMyFacultyProfile(): Promise<Faculty> {
  const response = await fetch(`${API_BASE_URL}/api/faculty/me`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Faculty>(response, "Unable to load faculty profile");
}

export async function createFaculty(payload: FacultyCreate): Promise<Faculty> {
  const response = await fetch(`${API_BASE_URL}/api/faculty`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({
      designation: "Faculty",
      workload_hours: 0,
      availability: [],
      availability_windows: [],
      avoid_back_to_back: false,
      preferred_min_break_minutes: 0,
      preferred_subject_codes: [],
      semester_preferences: {},
      ...payload,
    }),
  });
  return handleResponse<Faculty>(response, "Unable to create faculty");
}

export async function deleteFaculty(facultyId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/faculty/${facultyId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Unable to delete faculty");
  }
}

export async function updateFaculty(facultyId: string, payload: FacultyUpdate): Promise<Faculty> {
  const response = await fetch(`${API_BASE_URL}/api/faculty/${facultyId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse<Faculty>(response, "Unable to update faculty");
}

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  department: string | null;
  section_name: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listStudents(): Promise<StudentUser[]> {
  const response = await fetch(`${API_BASE_URL}/api/students`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<StudentUser[]>(response, "Unable to load students");
}
