import Link from "next/link";

export default function SourceNotFound() {
  return (
    <div role="alert" className="error-state">
      <p>Cette source n&apos;existe pas ou plus.</p>
      <Link href="/sources">Retour à la liste des sources</Link>
    </div>
  );
}
