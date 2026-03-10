import type { APIRequestContext, Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

type Role = "admin" | "faculty" | "student";

export interface UserSession {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    department?: string | null;
    section_name?: string | null;
    semester_number?: number | null;
  };
}

async function expectOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${context} failed (${response.status}): ${body}`);
  }
}

export async function registerOrLogin(
  request: APIRequestContext,
  payload: Record<string, unknown>,
): Promise<UserSession> {
  const registerResponse = await request.post(`${API_BASE_URL}/api/auth/register`, {
    data: payload,
  });
  if (!(registerResponse.ok() || registerResponse.status() === 409)) {
    const body = await registerResponse.text();
    throw new Error(`register failed (${registerResponse.status()}): ${body}`);
  }

  const loginResponse = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: {
      email: payload.email,
      password: payload.password,
      role: payload.role,
    },
  });
  if (!loginResponse.ok()) {
    const body = await loginResponse.text();
    throw new Error(`login failed (${loginResponse.status()}): ${body}`);
  }

  const loginBody = (await loginResponse.json()) as { access_token: string; user: UserSession["user"] };
  return {
    token: loginBody.access_token,
    user: loginBody.user,
  };
}

export async function createProgram(request: APIRequestContext, token: string): Promise<string> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const response = await request.post(`${API_BASE_URL}/api/programs`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `E2E Program ${suffix}`,
      code: `E2E-${suffix}`.slice(0, 20),
      department: "CSE",
      degree: "BS",
      duration_years: 4,
      sections: 1,
      total_students: 60,
    },
  });
  await expectOk(response, "create program");
  const body = (await response.json()) as { id: string };

  const termResponse = await request.post(`${API_BASE_URL}/api/programs/${body.id}/terms`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      term_number: 1,
      name: "Semester 1",
      credits_required: 1,
    },
  });
  await expectOk(termResponse, "create term");

  const sectionResponse = await request.post(`${API_BASE_URL}/api/programs/${body.id}/sections`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      term_number: 1,
      name: "A",
      capacity: 60,
    },
  });
  await expectOk(sectionResponse, "create section");

  return body.id;
}

export async function bootstrapRoleSessions(request: APIRequestContext): Promise<{
  admin: UserSession;
  faculty: UserSession;
  student: UserSession;
}> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const admin = await registerOrLogin(request, {
    name: `Admin ${suffix}`,
    email: `admin-${suffix}@example.com`,
    password: "password123",
    role: "admin",
    department: "Administration",
  });

  const programId = await createProgram(request, admin.token);

  const faculty = await registerOrLogin(request, {
    name: `Faculty ${suffix}`,
    email: `faculty-${suffix}@example.com`,
    password: "password123",
    role: "faculty",
    department: "CSE",
    program_id: programId,
  });

  const student = await registerOrLogin(request, {
    name: `Student ${suffix}`,
    email: `student-${suffix}@example.com`,
    password: "password123",
    role: "student",
    department: "CSE",
    program_id: programId,
    section_name: "A",
    semester_number: 1,
  });

  return { admin, faculty, student };
}

export async function openWithSession(page: Page, session: UserSession, path: string): Promise<void> {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("lastActivity", String(Date.now()));
    },
    { token: session.token, user: session.user },
  );

  await page.goto(path, { waitUntil: "networkidle" });
}
