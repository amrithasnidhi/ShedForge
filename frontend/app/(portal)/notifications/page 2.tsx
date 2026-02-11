"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listNotifications, markNotificationRead, type NotificationItem } from "@/lib/notification-api";

export default function NotificationsPage() {
  return (
    <AuthGuard allowedRoles={["admin", "scheduler", "faculty", "student"]}>
      <NotificationsContent />
    </AuthGuard>
  );
}

function NotificationsContent() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = async () => {
    try {
      const data = await listNotifications();
      setNotifications(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications");
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const handleRead = async (notificationId: string) => {
    try {
      const updated = await markNotificationRead(notificationId);
      setNotifications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notification");
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Schedule changes and system workflow alerts.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inbox</CardTitle>
          <CardDescription>{unreadCount} unread notification(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
                  <Button size="sm" variant="outline" onClick={() => void handleRead(item.id)}>Mark Read</Button>
                ) : null}
              </div>
            </div>
          ))}
          {!notifications.length ? <p className="text-sm text-muted-foreground">No notifications available.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
