import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21.5 21.5-4.85-4.85" />
    </svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2 13 13l-3.8 1.8L11 11z" />
      <path d="M12 2.5v1.4M12 20.1v1.4M21.5 12h-1.4M3.9 12H2.5" />
    </svg>
  );
}

export function AnchorIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v14M7 13a5 5 0 0 0 10 0M4 13h3m10 0h3" />
    </svg>
  );
}

export function ContainerShipIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 16.5 5 20h14l2-3.5" />
      <path d="M6 16.5V8h12v8.5" />
      <path d="M9 8V5h6v3M9 11.2h2.2M12.8 11.2H15M9 14h2.2M12.8 14H15" />
    </svg>
  );
}

export function WavesIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 9c1.3 1.3 2.7 1.3 4 0s2.7-1.3 4 0 2.7 1.3 4 0 2.7-1.3 4 0 2.7 1.3 4 0" />
      <path d="M2 15c1.3 1.3 2.7 1.3 4 0s2.7-1.3 4 0 2.7 1.3 4 0 2.7-1.3 4 0 2.7 1.3 4 0" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 15.5h-1a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4.5 3.5h9A1.5 1.5 0 0 1 15 5v1" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12.8 9 17l10.5-10.5" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 9.8v4.4" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SignatureIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      {/* main stylisée tenant le stylo */}
      <path d="M5 14.7c-1.3.3-2.2 1.3-2 2.6.3 1.6 2.1 2.4 3.9 1.9l2.3-.7c.8-.2 1.4-.9 1.7-1.7l.3-.9" />
      {/* stylo */}
      <path d="M9.2 15.9 18 7.1a1.8 1.8 0 0 0-2.5-2.5L6.6 13.4" />
      {/* trait de signature */}
      <path d="M2.5 21c2.7-1 4.3.4 6.7-1.3" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h16M13.5 5.5 20 12l-6.5 6.5" />
    </svg>
  );
}

export function AnchorSpinnerIcon(props: IconProps) {
  return (
    <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="9" strokeOpacity={0.25} />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

export function LifebuoyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m6.1 6.1 3.5 3.5M17.9 6.1l-3.5 3.5M6.1 17.9l3.5-3.5M17.9 17.9l-3.5-3.5" />
    </svg>
  );
}

export function ContainerBoxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 20.5 7v10L12 21 3.5 17V7z" />
      <path d="M3.5 7 12 11l8.5-4M12 11v10" />
    </svg>
  );
}
