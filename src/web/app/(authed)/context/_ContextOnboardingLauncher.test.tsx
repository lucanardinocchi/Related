import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContextOnboardingLauncher } from "./_ContextOnboardingLauncher";

const push = vi.fn();
const refresh = vi.fn();

let searchParams = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/deps/client", () => ({
  getBrowserDeps: () => ({
    onboarding: {
      startIfNeeded: vi.fn().mockResolvedValue({
        completedSteps: [],
        finishedAt: null,
        isFinished: false,
      }),
      finishOnboarding: vi.fn().mockResolvedValue({
        completedSteps: [],
        finishedAt: new Date().toISOString(),
        isFinished: true,
      }),
    },
    auth: {
      onAuthStateChange: () => () => {},
    },
    userProviderTokens: {
      getForProvider: vi.fn().mockResolvedValue(null),
    },
  }),
}));

vi.mock("@/lib/integrations/integrationConnect", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/integrations/integrationConnect")>();
  return {
    ...actual,
    captureGoogleProviderTokens: vi.fn().mockResolvedValue(null),
    refreshGoogleConnections: vi
      .fn()
      .mockResolvedValue({ calendar: false, gmail: false }),
    refreshOutlookConnection: vi
      .fn()
      .mockResolvedValue({ calendar: false, mail: false }),
    refreshInstagramConnection: vi.fn().mockResolvedValue(false),
    refreshXConnection: vi.fn().mockResolvedValue(false),
    refreshWhatsAppConnection: vi.fn().mockResolvedValue(false),
    refreshTikTokConnection: vi.fn().mockResolvedValue(false),
  };
});

const launcherProps = {
  calendar: false,
  outlook: false,
  gmail: false,
  instagram: false,
  x: false,
  whatsapp: false,
  tiktok: false,
  instagramAppId: null,
  xClientId: null,
  whatsappAppId: null,
  tiktokClientKey: null,
  microsoftClientId: null,
} as const;

describe("<ContextOnboardingLauncher />", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    searchParams = new URLSearchParams("");
  });

  it("renders the setup launcher on the context page", () => {
    render(<ContextOnboardingLauncher {...launcherProps} />);

    expect(
      screen.getByRole("button", { name: "Set up Related" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Set up Related")).toBeInTheDocument();
  });

  it("shows the onboarding wizard when ?onboarding=1", async () => {
    searchParams = new URLSearchParams("onboarding=1");

    render(<ContextOnboardingLauncher {...launcherProps} />);

    await waitFor(() => {
      expect(screen.getByText("Welcome to Related")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
  });
});
