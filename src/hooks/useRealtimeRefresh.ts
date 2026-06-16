"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Subscribe to live changes for a project and invoke `onChange` (debounced).
// RLS governs which rows the user actually receives.
export function useRealtimeRefresh(projectId: string, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250);
    };

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        debounced,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_statuses",
          filter: `project_id=eq.${projectId}`,
        },
        debounced,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [projectId]);
}
