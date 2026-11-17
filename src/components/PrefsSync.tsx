"use client";

import { useEffect } from "react";
import { usePreferences } from "@/lib/preferences";

// Loads the signed-in person's saved display and notification choices and starts saving changes to the account.
export default function PrefsSync() {
  const { connectAccount } = usePreferences();
  useEffect(() => {
    connectAccount();
  }, [connectAccount]);
  return null;
}
