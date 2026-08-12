export function VersionBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={isActive ? "badge badge-active" : "badge"}>
      {isActive ? "Active" : "Archivée"}
    </span>
  );
}
