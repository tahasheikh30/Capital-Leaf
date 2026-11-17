"use client";

import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { useNotifications } from "@/components/Toast";

// Link to the notification list, with a count of what has not been read yet.
export default function Bell({ className = "" }: { className?: string }) {
  const { unread } = useNotifications();
  return (
    <Link href="/notifications" className={`bell ${className}`} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
      <BellIcon size={19} aria-hidden="true" />
      {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
