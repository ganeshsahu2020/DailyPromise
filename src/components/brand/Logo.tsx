// src/components/brand/Logo.tsx
import React from "react";

type Variant = "icon" | "wordmark";
type Props = {
  variant?: Variant;
  size?: number;           // px height for wordmark OR square for icon
  mono?: boolean;          // force single-color for print/dark headers
  color?: string;          // used when mono=true
  title?: string;
  className?: string;
};

export default function Logo({
  variant = "wordmark",
  size = variant === "icon" ? 32 : 28,
  mono = false,
  color = "#ffffff",
  title = "DailyPromise",
  className,
}: Props) {
  if (variant === "icon") {
    return (
      <svg
        aria-label={title}
        role="img"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className={className}
      >
        <defs>
          <linearGradient id="dpGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mono ? color : "#1E3A8A"} />
            <stop offset="1" stopColor={mono ? color : "#34D399"} />
          </linearGradient>
        </defs>

        {/* Transparent tile with a soft outline for contrast on dark headers */}
        <rect
          rx="14"
          ry="14"
          width="64"
          height="64"
          fill="transparent"
          stroke={mono ? color : "rgba(255,255,255,0.25)"}
          strokeWidth="1.25"
        />

        {/* Heart/leaf blend */}
        <path
          d="M40 24c-4-5-11-5-15 0-5 6-1 15 6 19l9 6 9-6c7-4 11-13 6-19-4-5-11-5-15 0z"
          fill={mono ? "none" : "url(#dpGrad)"}
          stroke={mono ? color : "none"}
          strokeWidth={mono ? 3 : 0}
        />

        {/* Check mark */}
        <path
          d="M28 30l6 6 10-10"
          fill="none"
          stroke={mono ? color : "#F4C95D"}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // wordmark
  const h = size;
  const w = Math.round((520 / 96) * h); // keep aspect ratio
  return (
    <svg
      aria-label={title}
      role="img"
      width={w}
      height={h}
      viewBox="0 0 520 96"
      className={className}
    >
      <defs>
        <linearGradient id="dp" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mono ? color : "#1E3A8A"} />
          <stop offset="1" stopColor={mono ? color : "#34D399"} />
        </linearGradient>
      </defs>

      <g transform="translate(10,8)">
        {/* Icon left of wordmark */}
        <path
          d="M44 24c-5-6-15-7-20 0-6 7-1 18 8 24l12 8 12-8c9-6 14-17 8-24-5-7-15-6-20 0z"
          fill={mono ? "none" : "url(#dp)"}
          stroke={mono ? color : "none"}
          strokeWidth={mono ? 3 : 0}
        />
        <path
          d="M27 32l8 8 14-14"
          fill="none"
          stroke={mono ? color : "#F4C95D"}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Wordmark */}
        <text
          x="78"
          y="48"
          fontFamily="Poppins, Inter, system-ui"
          fontWeight={700}
          fontSize="40"
          fill={mono ? color : "#E6F0FF"}   /* brighter for dark bg */
        >
          Daily
        </text>
        <text
          x="176"
          y="48"
          fontFamily="Poppins, Inter, system-ui"
          fontWeight={700}
          fontSize="40"
          fill={mono ? color : "url(#dp)"}
        >
          Promise
        </text>
        <text
          x="78"
          y="74"
          fontFamily="Inter, system-ui"
          fontSize="14"
          fill={mono ? color : "#B6CCFF"}
          opacity={mono ? 1 : 0.95}
        >
          Promise. Practice. Prosper.
        </text>
      </g>
    </svg>
  );
}
