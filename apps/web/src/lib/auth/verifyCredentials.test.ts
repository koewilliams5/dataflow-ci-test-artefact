import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

const findUserByEmail = vi.fn();

vi.mock("@dataflow-ci/database", () => ({
  userRepository: {
    findUserByEmail: (...args: unknown[]) => findUserByEmail(...args),
  },
}));

const { verifyCredentials } = await import("./verifyCredentials");

const KNOWN_EMAIL = "demo@dataflow-ci.com";
const KNOWN_PASSWORD = "password123";
const KNOWN_PASSWORD_HASH = bcrypt.hashSync(KNOWN_PASSWORD, 10);

describe("verifyCredentials", () => {
  it("connexion réussie : retourne { id, email } sans le hash quand le mot de passe est correct", async () => {
    findUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: KNOWN_EMAIL,
      passwordHash: KNOWN_PASSWORD_HASH,
    });

    const result = await verifyCredentials(KNOWN_EMAIL, KNOWN_PASSWORD);

    expect(result).toEqual({ id: "user-1", email: KNOWN_EMAIL });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("mauvais mot de passe : retourne null", async () => {
    findUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: KNOWN_EMAIL,
      passwordHash: KNOWN_PASSWORD_HASH,
    });

    const result = await verifyCredentials(KNOWN_EMAIL, "wrong-password");

    expect(result).toBeNull();
  });

  it("utilisateur inconnu : retourne null", async () => {
    findUserByEmail.mockResolvedValueOnce(null);

    const result = await verifyCredentials("unknown@dataflow-ci.com", KNOWN_PASSWORD);

    expect(result).toBeNull();
  });
});
