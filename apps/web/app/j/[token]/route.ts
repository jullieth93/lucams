import { notFound, redirect } from "next/navigation";
import { resolveLifecycleClick } from "@/features/lifecycle/attribution";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const targetPath = await resolveLifecycleClick(token);
  if (!targetPath) notFound();
  redirect(targetPath);
}
