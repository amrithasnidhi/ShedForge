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

export type NotificationType = "timetable" | "issue" | "system" | "workflow" | "feedback";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  is_read: boolean;
  created_at: string;
}

export interface NotificationFilter {
  notification_type?: NotificationType;
  is_read?: boolean;
  limit?: number;
  offset?: number;
}

export interface NotificationEvent {
  event: "connected" | "pong" | "notification.created" | "notification.read";
  user_id?: string;
  notification?: NotificationItem;
}

export async function listNotifications(filter: NotificationFilter = {}): Promise<NotificationItem[]> {
  const params = new URLSearchParams();
  if (filter.notification_type) {
    params.set("notification_type", filter.notification_type);
  }
  if (typeof filter.is_read === "boolean") {
    params.set("is_read", String(filter.is_read));
  }
  if (typeof filter.limit === "number") {
    params.set("limit", String(filter.limit));
  }
  if (typeof filter.offset === "number") {
    params.set("offset", String(filter.offset));
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/notifications${query}`, {
    headers: getAuthHeaders(),
  });
  return parseOrThrow<NotificationItem[]>(response, "Unable to load notifications");
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return parseOrThrow<NotificationItem>(response, "Unable to mark notification as read");
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return parseOrThrow<{ updated: number }>(response, "Unable to mark notifications as read");
}

export function getNotificationsWebSocketUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const token = localStorage.getItem("token");
  if (!token) {
    return null;
  }
  const wsBase = API_BASE_URL.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  return `${wsBase}/api/notifications/ws?token=${encodeURIComponent(token)}`;
}
