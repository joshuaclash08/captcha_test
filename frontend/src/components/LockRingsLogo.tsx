import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type LogoVariant = 'hero' | 'compact';

interface LockRingsLogoProps {
  className?: string;
  size?: number;
  variant?: LogoVariant;
  animated?: boolean;
}

interface RingSegment {
  id: string;
  radius: number;
  paths: string[];
  stroke: string;
  strokeWidth: number;
  opacity: number;
  direction: 1 | -1;
  duration: number;
  delay: number;
}

interface RingConfig {
  radius: number;
  segments: number;
  minSweep: number;
  maxSweep: number;
  minGap: number;
  maxGap: number;
  strokeWidth: number;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

function randomInt(rand: () => number, min: number, max: number): number {
  return Math.floor(randomRange(rand, min, max + 1));
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArcFlag} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function buildIrregularRingPaths(
  rand: () => number,
  radius: number,
  segmentCount: number,
  minSweep: number,
  maxSweep: number,
  minGap: number,
  maxGap: number
): string[] {
  const sweeps = Array.from({ length: segmentCount }, () => randomRange(rand, minSweep, maxSweep));
  const gaps = Array.from({ length: segmentCount }, () => randomRange(rand, minGap, maxGap));
  const total = sweeps.reduce((acc, v) => acc + v, 0) + gaps.reduce((acc, v) => acc + v, 0);
  const scale = 360 / total;
  let cursor = randomRange(rand, 0, 18);

  return sweeps.map((sweep, idx) => {
    const scaledSweep = sweep * scale;
    const start = cursor;
    const end = start + scaledSweep;
    cursor = end + gaps[idx] * scale;
    return describeArc(160, 160, radius, start, end);
  });
}

function buildSegments(variant: LogoVariant): RingSegment[] {
  const ringConfigs: RingConfig[] =
    variant === 'hero'
      ? [
          { radius: 66, segments: 10, minSweep: 8, maxSweep: 24, minGap: 6, maxGap: 28, strokeWidth: 7.5 },
          { radius: 82, segments: 11, minSweep: 8, maxSweep: 22, minGap: 6, maxGap: 30, strokeWidth: 7 },
          { radius: 98, segments: 12, minSweep: 7, maxSweep: 20, minGap: 5.5, maxGap: 29, strokeWidth: 6.3 },
          { radius: 114, segments: 13, minSweep: 6.5, maxSweep: 19, minGap: 5, maxGap: 27, strokeWidth: 5.7 },
          { radius: 130, segments: 14, minSweep: 6, maxSweep: 18, minGap: 4.5, maxGap: 26, strokeWidth: 5.2 }
        ]
      : [
          { radius: 74, segments: 9, minSweep: 8, maxSweep: 22, minGap: 6, maxGap: 26, strokeWidth: 7 },
          { radius: 94, segments: 10, minSweep: 7, maxSweep: 19, minGap: 5, maxGap: 23, strokeWidth: 5.8 },
          { radius: 114, segments: 11, minSweep: 6, maxSweep: 16, minGap: 4.5, maxGap: 22, strokeWidth: 4.9 },
          { radius: 132, segments: 12, minSweep: 5.5, maxSweep: 15, minGap: 4, maxGap: 20, strokeWidth: 4.3 }
        ];

  const palette = ['#f8fafc', '#dbe1ea', '#b8c0ce', '#f0f4fa'];
  const segments: RingSegment[] = [];

  ringConfigs.forEach((ring, ringIndex) => {
    const ringSeed = 2417 + ringIndex * 991;
    const rand = mulberry32(ringSeed);
    const direction: 1 | -1 = ringIndex % 2 === 0 ? 1 : -1;

    segments.push({
      id: `ring-${ringIndex}`,
      radius: ring.radius,
      paths: buildIrregularRingPaths(
        rand,
        ring.radius,
        variant === 'hero' ? ring.segments : randomInt(rand, ring.segments - 1, ring.segments + 1),
        ring.minSweep,
        ring.maxSweep,
        ring.minGap,
        ring.maxGap
      ),
      stroke: palette[Math.floor(rand() * palette.length)],
      strokeWidth: ring.strokeWidth,
      opacity: randomRange(rand, 0.48, 0.96),
      direction,
      duration: randomRange(rand, 18, 34),
      delay: randomRange(rand, 0, 1.8)
    });
  });

  return segments;
}

export default function LockRingsLogo({
  className,
  size = 140,
  variant = 'hero',
  animated = variant === 'hero'
}: LockRingsLogoProps) {
  const id = useId().replace(/:/g, '');
  const prefersReducedMotion = useReducedMotion();
  const animateSegments = animated && !prefersReducedMotion;
  const segments = buildSegments(variant);
  const filterId = `lock-rings-glow-${id}`;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 320"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${filterId})`}>
        {segments.map((segment) => (
          <motion.g
            key={segment.id}
            initial={false}
            style={{ transformOrigin: '160px 160px', transformBox: 'fill-box' }}
            animate={animateSegments ? { rotate: segment.direction === 1 ? 360 : -360 } : undefined}
            transition={
              animateSegments
                ? {
                    duration: segment.duration,
                    delay: segment.delay,
                    ease: 'linear',
                    repeat: Infinity,
                    repeatType: 'loop'
                  }
                : undefined
            }
          >
            {segment.paths.map((d, idx) => (
              <path
                key={`${segment.id}-p-${idx}`}
                d={d}
                stroke={segment.stroke}
                strokeWidth={segment.strokeWidth}
                strokeLinecap="round"
                opacity={segment.opacity}
              />
            ))}
          </motion.g>
        ))}
      </g>

      <g>
        <path
          d="M138 150V133C138 120.85 147.85 111 160 111C172.15 111 182 120.85 182 133V150"
          stroke="#f7fafc"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="124" y="146" width="72" height="64" rx="17" fill="#05070c" stroke="#f7fafc" strokeWidth="7" />
        <circle cx="160" cy="177" r="6.5" fill="#f7fafc" />
        <rect x="157" y="182" width="6" height="16" rx="3" fill="#f7fafc" />
      </g>
    </svg>
  );
}