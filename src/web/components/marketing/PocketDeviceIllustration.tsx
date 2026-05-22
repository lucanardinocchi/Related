import { cn } from "@/lib/cn";

export function PocketDeviceIllustration({
  recording = false,
  className,
}: {
  recording?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-[168px] w-auto", className)}
      aria-hidden
      role="img"
      aria-label="Voice recorder"
    >
      <ellipse
        cx="60"
        cy="188"
        rx="34"
        ry="5"
        fill="#37352f"
        opacity="0.08"
      />

      {recording ? (
        <rect
          x="20"
          y="10"
          width="80"
          height="168"
          rx="18"
          stroke="#b91c1c"
          strokeOpacity="0.35"
          strokeWidth="2"
          className="animate-pulse"
        />
      ) : null}

      <rect
        x="28"
        y="18"
        width="64"
        height="152"
        rx="14"
        fill="#e3e2df"
        stroke="#d3d2cf"
        strokeWidth="1.5"
      />

      <rect
        x="32"
        y="22"
        width="56"
        height="144"
        rx="12"
        fill="#f7f6f3"
        stroke="#efeeec"
        strokeWidth="1"
      />

      <rect
        x="34"
        y="24"
        width="8"
        height="140"
        rx="4"
        fill="#ebebea"
      />

      <circle cx="60" cy="48" r="11" fill="#f1f1ef" stroke="#d3d2cf" strokeWidth="1" />
      <circle
        cx="60"
        cy="48"
        r="4"
        fill={recording ? "#b91c1c" : "#91918e"}
        className={recording ? "animate-pulse" : undefined}
      />

      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={48 + index * 6}
          y="62"
          width="4"
          height="1.5"
          rx="0.75"
          fill="#d3d2cf"
        />
      ))}

      <rect x="52" y="118" width="16" height="2" rx="1" fill="#efeeec" />
      <rect x="50" y="128" width="20" height="2" rx="1" fill="#efeeec" />
      <rect x="54" y="138" width="12" height="2" rx="1" fill="#efeeec" />

      <circle cx="60" cy="164" r="3" fill="#d3d2cf" />
    </svg>
  );
}
