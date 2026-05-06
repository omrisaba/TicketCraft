import { cn } from '../../utils/cn';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

function getColorClass(ratio: number): string {
  if (ratio >= 0.9) return 'bg-green-500';
  if (ratio >= 0.7) return 'bg-blue-500';
  if (ratio >= 0.5) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function ProgressBar({
  value,
  max,
  label,
  showValue = true,
  size = 'md',
  className,
}: ProgressBarProps) {
  const ratio = Math.min(value / max, 1);
  const percentage = Math.round(ratio * 100);

  return (
    <div className={cn('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-sm">
          {label && <span className="text-gray-600">{label}</span>}
          {showValue && (
            <span className="font-medium text-gray-900">
              {value}/{max}
            </span>
          )}
        </div>
      )}
      <div
        className={cn('w-full rounded-full bg-gray-200', {
          'h-2': size === 'sm',
          'h-3': size === 'md',
        })}
      >
        <div
          className={cn('rounded-full transition-all duration-500 ease-out', getColorClass(ratio), {
            'h-2': size === 'sm',
            'h-3': size === 'md',
          })}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
