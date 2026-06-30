import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUsers } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }
  redirect("/login");
}
