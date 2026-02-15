import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules
const mockSendEmail = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  profileReminderEmail: vi.fn(({ name, daysAgo }: { name: string; daysAgo: number }) => ({
    subject: `Reminder for ${name}`,
    html: `<p>You signed up ${daysAgo} days ago</p>`,
    text: `You signed up ${daysAgo} days ago`,
  })),
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();
const mockGetUserById = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: mockSelect,
          update: (...args: unknown[]) => {
            mockUpdate(...args);
            return { eq: mockUpdateEq };
          },
        };
      }
      return {};
    },
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  }),
}));

import { POST } from "./route";

function makeRequest(secret?: string) {
  const headers = new Headers();
  if (secret) headers.set("x-cron-secret", secret);
  return new Request("http://localhost/api/cron/profile-reminders", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

describe("POST /api/cron/profile-reminders", () => {
  it("rejects requests without cron secret", async () => {
    const res = await POST(makeRequest() as any);
    expect(res.status).toBe(401);
  });

  it("rejects requests with wrong cron secret", async () => {
    const res = await POST(makeRequest("wrong") as any);
    expect(res.status).toBe(401);
  });

  it("sends reminders to eligible users", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Chain: select → eq → lt → order → limit
    const mockLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "user-1",
          username: "testuser",
          full_name: "Test User",
          created_at: tenDaysAgo,
          reminder_sent_at: null,
        },
      ],
      error: null,
    });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder });
    const mockEq = vi.fn().mockReturnValue({ lt: mockLt });
    mockSelect.mockReturnValue({ eq: mockEq });

    mockGetUserById.mockResolvedValue({
      data: { user: { email: "test@example.com" } },
    });
    mockUpdateEq.mockResolvedValue({ error: null });

    const res = await POST(makeRequest("test-secret") as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com" })
    );
  });

  it("skips users who received a reminder recently", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const mockLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "user-1",
          username: "recentreminder",
          full_name: "Recent",
          created_at: tenDaysAgo,
          reminder_sent_at: twoDaysAgo, // reminded 2 days ago, skip
        },
      ],
      error: null,
    });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder });
    const mockEq = vi.fn().mockReturnValue({ lt: mockLt });
    mockSelect.mockReturnValue({ eq: mockEq });

    const res = await POST(makeRequest("test-secret") as any);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.eligible).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 0 when no incomplete profiles", async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder });
    const mockEq = vi.fn().mockReturnValue({ lt: mockLt });
    mockSelect.mockReturnValue({ eq: mockEq });

    const res = await POST(makeRequest("test-secret") as any);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.total).toBe(0);
  });
});
