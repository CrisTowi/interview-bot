const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const MicIcon = () => (
  <svg {...base}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const VolumeIcon = () => (
  <svg {...base}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export const MutedIcon = () => (
  <svg {...base}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base} width={14} height={14}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const MicOffIcon = () => (
  <svg {...base}>
    <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5" />
    <path d="M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" />
  </svg>
);

export const KeyboardIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
  </svg>
);

export const CaptionsIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M10 10.5a2 2 0 1 0 0 3M16.5 10.5a2 2 0 1 0 0 3" />
  </svg>
);

export const TranscriptIcon = () => (
  <svg {...base}>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M8 9h8M8 12.5h5" />
  </svg>
);

export const HangUpIcon = () => (
  <svg {...base}>
    <path d="M3 14.5c5-4.7 13-4.7 18 0l-2.3 2.6-3.6-1.4-.5-2.6a10 10 0 0 0-5.2 0l-.5 2.6-3.6 1.4L3 14.5z" />
  </svg>
);

/** Head-and-shoulders placeholder for the call tiles. */
export const Silhouette = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="44" r="22" />
    <path d="M18 120c0-26 19-42 42-42s42 16 42 42z" />
  </svg>
);
