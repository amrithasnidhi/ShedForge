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

async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let detail = fallback;
  try {
    const data = await response.json();
    detail = data?.detail ?? fallback;
  } catch {
    // ignore parsing errors
  }
  throw new Error(detail);
}

export interface LabeledCount {
  label: string;
  value: number;
}

export interface DailyCountPoint {
  date: string;
  value: number;
}

export interface ResourceInventory {
  programs: number;
  programTerms: number;
  programSections: number;
  courses: number;
  faculty: number;
  roomsTotal: number;
  lectureRooms: number;
  labRooms: number;
  seminarRooms: number;
  usersTotal: number;
  usersByRole: Record<string, number>;
}

export interface TimetableSnapshot {
  isPublished: boolean;
  updatedAt?: string | null;
  totalSlots: number;
  sections: number;
  faculty: number;
  rooms: number;
  courses: number;
  slotsByDay: Record<string, number>;
}

export interface UtilizationSnapshot {
  roomUtilizationPercent: number;
  facultyUtilizationPercent: number;
  sectionCoveragePercent: number;
}

export interface CapacitySnapshot {
  totalRoomCapacity: number;
  lectureRoomCapacity: number;
  labRoomCapacity: number;
  seminarRoomCapacity: number;
  configuredSectionCapacity: number;
  scheduledStudentSeats: number;
}

export interface ActivityAnalytics {
  windowDays: number;
  totalLogs: number;
  actionsLastWindow: number;
  activeUsers: number;
  actionsByDay: DailyCountPoint[];
  topActions: LabeledCount[];
  topEntities: LabeledCount[];
  recentLogs: Array<{
    id: string;
    user_id?: string | null;
    action: string;
    entity_type?: string | null;
    entity_id?: string | null;
    details: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface OperationsSnapshot {
  unreadNotifications: number;
  notificationsByType: LabeledCount[];
  leavesByStatus: LabeledCount[];
  issuesByStatus: LabeledCount[];
  feedbackByStatus: LabeledCount[];
}

export interface SystemAnalyticsPayload {
  generatedAt: string;
  inventory: ResourceInventory;
  timetable: TimetableSnapshot;
  utilization: UtilizationSnapshot;
  capacity: CapacitySnapshot;
  activity: ActivityAnalytics;
  operations: OperationsSnapshot;
}

export async function fetchSystemAnalytics(days = 14): Promise<SystemAnalyticsPayload> {
  const response = await fetch(`${API_BASE_URL}/api/system/analytics?days=${encodeURIComponent(String(days))}`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<SystemAnalyticsPayload>(response, "Unable to load system analytics");
}
