import { describe, expect, it, vi } from "vitest";

const signOut = vi.fn();

vi.mock("../../auth", () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));

const { logoutAction } = await import("./actions");

describe("logoutAction — déconnexion", () => {
  it("appelle signOut avec une redirection vers /login", async () => {
    await logoutAction();

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
