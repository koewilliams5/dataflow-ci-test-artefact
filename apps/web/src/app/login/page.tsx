import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main>
      <h1>Connexion</h1>
      <LoginForm />
    </main>
  );
}
