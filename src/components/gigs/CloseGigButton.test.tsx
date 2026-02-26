import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CloseGigButton } from "./CloseGigButton";

const mockRefresh = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/api", () => ({
  gigs: {
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  },
}));

describe("CloseGigButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders for active gig", () => {
    render(<CloseGigButton gigId="gig-1" status="active" />);
    expect(screen.getByRole("button", { name: /archive gig/i })).toBeInTheDocument();
  });

  it("does not render for closed gig", () => {
    const { container } = render(<CloseGigButton gigId="gig-1" status="closed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("calls status API with closed and refreshes", async () => {
    mockUpdateStatus.mockResolvedValue({ success: true });

    render(<CloseGigButton gigId="gig-1" status="active" />);
    fireEvent.click(screen.getByRole("button", { name: /archive gig/i }));

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith("gig-1", "closed");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("shows error when API fails", async () => {
    mockUpdateStatus.mockResolvedValue({ error: "Forbidden" });

    render(<CloseGigButton gigId="gig-1" status="active" />);
    fireEvent.click(screen.getByRole("button", { name: /archive gig/i }));

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });
});
