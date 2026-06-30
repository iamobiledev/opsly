import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUsers } from "../lib/auth";

export default async function HomePage() {
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }
  redirect("/login");
}
