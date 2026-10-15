"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HubSidebar } from "@/components/layout/HubSidebar";
import type { Session } from "@supabase/supabase-js";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
      if (!data.session) router.replace("/login");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) router.replace("/login");
    });

    return () => listener.subscription.unsubscribe();
  }, [router, supabase]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-mist">
        <p className="font-mono text-sm">Checking session…</p>
      </div>
    );
  }

  if (!session) return null; // redirecting

  return (
    <div className="flex min-h-screen bg-black text-mist">
      <HubSidebar userEmail={session.user.email ?? ""} />
      <main className="flex-1 overflow-y-auto bg-black">{children}</main>
    </div>
  );
}