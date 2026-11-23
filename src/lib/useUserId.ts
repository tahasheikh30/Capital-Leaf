"use client";

import { useEffect, useState } from "react";
import { rememberUser } from "@/lib/offlineQueue";
import { createClient } from "@/lib/supabase/client";

// The signed in person's id (read from the local session, no network). Empty until known.
export function useUserId() {
  const [id, setId] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => createClient().auth.getSession())
      .then(({ data }) => {
        const uid = data.session?.user.id;
        if (live && uid) {
          rememberUser(uid);
          setId(uid);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return id;
}
