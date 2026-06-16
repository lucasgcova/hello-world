import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageEditor } from "@/components/PageEditor";
import type { Page } from "@/lib/types";

export default async function DocPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("id", pageId)
    .single();
  if (!page) notFound();
  const p = page as Page;

  const { data: children } = await supabase
    .from("pages")
    .select("*")
    .eq("parent_id", pageId)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  return (
    <PageEditor
      page={p}
      childPages={(children ?? []) as Page[]}
      workspaceId={p.workspace_id}
    />
  );
}
