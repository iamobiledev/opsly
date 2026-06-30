"use server";

import { redirect } from "next/navigation";
import { authenticate, createBootstrapUser, signOut } from "../auth";

export async function setupAction(formData: FormData) {
  await createBootstrapUser({
    organizationName: String(formData.get("organizationName") ?? "ROWS"),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? "")
  });
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  await authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}
