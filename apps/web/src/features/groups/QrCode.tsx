import { useMemo } from 'react';
import { encode } from 'uqr';

interface QrCodeProps {
  value: string;
  /** Read by screen readers instead of the pattern. */
  label: string;
  className?: string;
}

/**
 * A QR code drawn as one SVG path, so it stays sharp on a projector. Medium error correction keeps
 * it readable from the back of a lecture hall, even under glare.
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    const parts: string[] = [];
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) {
          parts.push(`M${String(x)} ${String(y)}h1v1h-1z`);
        }
      });
    });
    return { path: parts.join(''), size: qr.size };
  }, [value]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  );
}
