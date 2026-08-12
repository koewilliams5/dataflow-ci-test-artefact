import Link from "next/link";

export default function IngestionNotFound() {
  return (
    <div role="alert" className="error-state">
      <p>Cette ingestion n&apos;existe pas ou plus.</p>
      <Link href="/ingestions">Retour aux ingestions</Link>
    </div>
  );
}
