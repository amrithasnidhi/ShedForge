"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getNotificationsWebSocketUrl,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationEvent,
  type NotificationItem,
  type NotificationType,
} from "@/lib/notification-api";

type ReadFilter = "all" | "unread" | "read";
type TypeFilter = "all" | NotificationType;

export default function NotificationsPage() {
  return <NotificationsContent />;
}

function NotificationsContent() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await listNotifications({
        notification_type: typeFilter === "all" ? undefined : typeFilter,
        is_read: readFilter === "all" ? undefined : readFilter === "read",
        limit: 200,
      });
      setNotifications(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [typeFilter, readFilter]);

  useEffect(() => {
    const wsUrl = getNotificationsWebSocketUrl();
    if (!wsUrl) {
      setSocketStatus("disconnected");
      return;
    }

    let isUnmounted = false;
    const connect = () => {
      setSocketStatus("connecting");
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (isUnmounted) return;
        setSocketStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as NotificationEvent;
          if (payload.event === "notification.created") {
            const incoming = payload.notification;
            if (!incoming) {
              return;
            }
            setNotifications((prev) => {
              const exists = prev.some((item) => item.id === incoming.id);
              if (exists) {
                return prev;
              }

              const matchesType = typeFilter === "all" || incoming.notification_type === typeFilter;
              const matchesRead =
                readFilter === "all" ||
                (readFilter === "read" && incoming.is_read) ||
                (readFilter === "unread" && !incoming.is_read);
              if (!matchesType || !matchesRead) {
                return prev;
              }
              return [incoming, ...prev];
            });
          } else if (payload.event === "notification.read") {
            const updated = payload.notification;
            if (!updated) {
              return;
            }
            setNotifications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
          }
        } catch {
          // ignore malformed websocket payloads
        }
      };

      socket.onclose = () => {
        if (isUnmounted) return;
        setSocketStatus("disconnected");
        reconnectTimerRef.current = setTimeout(connect, 2500);
      };

      socket.onerror = () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };
    };

    connect();
    return () => {
      isUnmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [typeFilter, readFilter]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const handleRead = async (notificationId: string) => {
    try {
      const updated = await markNotificationRead(notificationId);
      setNotifications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notification");
    }
  };

  const handleReadAll = async () => {
    try {
      const result = await markAllNotificationsRead();
      if (result.updated > 0) {
        setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notifications as read");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Email and in-app alerts for timetable and workflow events.</p>
        </div>
        <Badge variant={socketStatus === "connected" ? "default" : "outline"}>
          {socketStatus === "connected" ? "Live updates connected" : socketStatus === "connecting" ? "Connecting..." : "Live updates disconnected"}
        </Badge>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inbox</CardTitle>
          <CardDescription>{unreadCount} unread notification(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="timetable">Timetable</SelectItem>
                  <SelectItem value="workflow">Workflow</SelectItem>
                  <SelectItem value="issue">Issues</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Select value={readFilter} onValueChange={(value) => setReadFilter(value as ReadFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unread">Unread Only</SelectItem>
                  <SelectItem value="read">Read Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void loadNotifications()} disabled={isLoading}>
                Refresh
              </Button>
              <Button variant="secondary" onClick={() => void handleReadAll()} disabled={unreadCount === 0}>
                Mark All Read
              </Button>
            </div>
          </div>

          {isLoading ? <p className="text-sm text-muted-foreground">Loading notifications...</p> : null}

          {!isLoading && notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications available for the current filters.</p>
          ) : null}

          {notifications.map((item) => (
            <div key={item.id} className="border rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  <Badge variant="outline">{item.notification_type}</Badge>
                </div>
                {!item.is_read ? <Badge>Unread</Badge> : <Badge variant="secondary">Read</Badge>}
              </div>
              <p className="text-sm">{item.message}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                {!item.is_read ? (
                  <Button size="sm" variant="outline" onClick={() => void handleRead(item.id)}>
                    Mark Read
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
