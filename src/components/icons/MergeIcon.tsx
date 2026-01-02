interface MergeIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function MergeIcon({
  size = 16,
  strokeWidth = 2,
  className,
}: MergeIconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Two branches converging into one */}
      <path d="M6 3v6" />
      <path d="M18 3v6" />
      <path d="M6 9a6 6 0 0 0 6 6" />
      <path d="M18 9a6 6 0 0 1-6 6" />
      <path d="M12 15v6" />
    </svg>
  );
}
