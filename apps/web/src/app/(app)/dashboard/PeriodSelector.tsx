import Link from "next/link";

interface PeriodSelectorProps {
  current: number;
  options: readonly number[];
}

export function PeriodSelector({ current, options }: PeriodSelectorProps) {
  return (
    <div className="period-selector">
      {options.map((days) => (
        <Link
          key={days}
          href={`/dashboard?days=${days}`}
          className={days === current ? "badge badge-active" : "badge"}
        >
          {days} jours
        </Link>
      ))}
    </div>
  );
}
