import bcrypt from "bcryptjs";
import { userRepository } from "@dataflow-ci/database";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

// Hash bcrypt valide d'un mot de passe factice, calculé une fois au chargement
// du module. Utilisé comme cible de comparaison quand l'utilisateur n'existe
// pas, pour que verifyCredentials prenne un temps comparable dans les deux cas
// ("utilisateur inconnu" vs "mauvais mot de passe") — sans ça, la différence de
// temps de réponse permettrait de deviner quels emails sont enregistrés.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-safety", 10);

/**
 * Vérifie un couple email/mot de passe contre la base. Ne lève jamais — un
 * couple invalide (email inconnu ou mot de passe incorrect) retourne `null`
 * dans les deux cas, sans distinction, pour ne pas permettre l'énumération de
 * comptes via le message d'erreur.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await userRepository.findUserByEmail(email);
  const passwordHash = user?.passwordHash ?? DUMMY_HASH;
  const isValid = await bcrypt.compare(password, passwordHash);

  if (!user || !isValid) {
    return null;
  }

  return { id: user.id, email: user.email };
}
