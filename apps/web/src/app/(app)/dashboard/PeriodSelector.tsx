import Link from "next/link";

interface PeriodSelectorProps {
  current: number;
  options: readonly number[];
}

export function PeriodSelector({ current, options }: PeriodSelectorProps) {
  return (
    <div className="segmented" role="group" aria-label="Période affichée">
      {options.map((days) => (
        <Link
          key={days}
          href={`/dashboard?days=${days}`}
          className="segmented-item"
          aria-pressed={days === current}
        >
          {days} jours
        </Link>
      ))}
    </div>
  );
}
