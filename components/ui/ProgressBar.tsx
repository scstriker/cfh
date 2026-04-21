interface ProgressBarProps {
  value: number;
  label?: string;
}

function clamp(value: number) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const safeValue = clamp(value);

  return (
    <div className="w-full">
      {label ? <p className="mb-2 text-sm text-cfh-muted">{label}</p> : null}
      <div className="h-2 w-full rounded-full bg-cfh-bg">
        <div
          className="h-2 rounded-full bg-cfh-accent transition-all"
          style={{ width: `${safeValue}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-cfh-muted">{safeValue.toFixed(0)}%</p>
    </div>
  );
}
