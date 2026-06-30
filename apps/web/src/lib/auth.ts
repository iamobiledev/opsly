import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@opsly/db";
import { hashToken } from "@opsly/core";

const COOKIE_NAME = "opsly_session";
const SESSION_DAYS = 14;

export async function hasAnyUsers(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true }
          }
        }
      }
    }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const role = user.memberships[0]?.role;
  if (role !== "owner" && role !== "admin") {
    throw new Error("Admin role required");
  }
  return user;
}

export async function createBootstrapUser({
  organizationName,
  name,
  email,
  password
}: {
  organizationName: string;
  name: string;
  email: string;
  password: string;
}) {
  if (await hasAnyUsers()) {
    throw new Error("Setup is already complete");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = slugify(organizationName);

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName, slug }
    });
    const user = await tx.user.create({
      data: { name, email: email.toLowerCase(), passwordHash }
    });
    await tx.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: "owner" }
    });
    return { organization, user };
  });

  await signInUser(result.user.id);
  return result;
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await signInUser(user.id);
}

export async function signOut() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(COOKIE_NAME);
}

async function signInUser(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}
