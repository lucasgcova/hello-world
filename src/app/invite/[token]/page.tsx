import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvite } from "@/components/AcceptInvite";

interface InvitationInfo {
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: string;
  accepted: boolean;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  const { data } = await supabase.rpc("get_invitation", { _token: token });
  const info = ((data ?? []) as InvitationInfo[])[0] ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AcceptInvite
        token={token}
        workspaceName={info?.workspace_name ?? null}
        invitedEmail={info?.email ?? null}
        accepted={info?.accepted ?? false}
        userEmail={user.email ?? ""}
      />
    </main>
  );
}
