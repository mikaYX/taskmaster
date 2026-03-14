interface ProgressRingProps {
    percentage: number;
    size?: number;
    strokeWidth?: number;
}

export function ProgressRing({ percentage, size = 150, strokeWidth = 12 }: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, percentage));
    const offset = circumference - (clamped / 100) * circumference;

    const color = clamped >= 80 ? '#10b981' : clamped >= 50 ? '#f59e0b' : '#ef4444';
    const glowColor = clamped >= 80 ? 'rgba(16,185,129,0.35)' : clamped >= 50 ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)';

    return (
        <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" style={{ filter: `drop-shadow(0 0 12px ${glowColor})` }}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    className="stroke-muted/40"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold tracking-tight text-foreground">{clamped}%</span>
            </div>
        </div>
    );
}
