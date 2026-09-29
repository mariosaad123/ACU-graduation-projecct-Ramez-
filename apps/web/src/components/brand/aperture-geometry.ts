/*
 * Geometry of an iris aperture, the motif of the Faculty of Languages and Translation logo.
 *
 * An inner regular polygon forms the opening. Each side of that polygon is extended until it
 * meets the outer circle; the region between two consecutive extended sides is one blade.
 * With six blades, each one stands for one of the six languages taught on the platform.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Blade {
  path: string;
  /** A point well inside the blade, used to place its label. */
  anchor: Point;
}

export interface ApertureOptions {
  blades: number;
  outerRadius: number;
  /** Radius of the central opening, as a fraction of the outer radius (0–1). */
  opening: number;
  /** Rotation of the whole aperture, in degrees. */
  rotation?: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const format = ({ x, y }: Point) => `${round(x)} ${round(y)}`;

function pointOnCircle(radius: number, angle: number): Point {
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** Continues the ray from `from` through `through` until it reaches the circle of `radius`. */
function extendToCircle(from: Point, through: Point, radius: number): Point {
  const length = Math.hypot(through.x - from.x, through.y - from.y);
  const direction = { x: (through.x - from.x) / length, y: (through.y - from.y) / length };
  const projection = through.x * direction.x + through.y * direction.y;
  const distanceSquared = through.x ** 2 + through.y ** 2;
  const step = -projection + Math.sqrt(projection ** 2 - (distanceSquared - radius ** 2));
  return { x: through.x + step * direction.x, y: through.y + step * direction.y };
}

export function createAperture({
  blades,
  outerRadius,
  opening,
  rotation = 0,
}: ApertureOptions): Blade[] {
  if (blades < 3) {
    throw new RangeError('An aperture needs at least three blades');
  }
  if (opening <= 0 || opening >= 1) {
    throw new RangeError('The opening must be between 0 and 1');
  }

  const innerRadius = outerRadius * opening;
  const step = (2 * Math.PI) / blades;
  const offset = (rotation * Math.PI) / 180;

  const inner = Array.from({ length: blades }, (_, index) =>
    pointOnCircle(innerRadius, offset + index * step),
  );
  const at = (index: number): Point => inner[index % blades] ?? { x: 0, y: 0 };

  const tips = inner.map((_, index) => extendToCircle(at(index), at(index + 1), outerRadius));
  const tip = (index: number): Point => tips[index % blades] ?? { x: 0, y: 0 };

  return inner.map((_, index) => {
    const root = at(index + 1);
    const start = tip(index);
    const end = tip(index + 1);

    const startAngle = Math.atan2(start.y, start.x);
    const arcMiddle = pointOnCircle(outerRadius, startAngle + step / 2);

    return {
      path: `M ${format(root)} L ${format(start)} A ${round(outerRadius)} ${round(outerRadius)} 0 0 1 ${format(end)} Z`,
      anchor: {
        x: round((root.x + start.x + end.x + arcMiddle.x * 2) / 5),
        y: round((root.y + start.y + end.y + arcMiddle.y * 2) / 5),
      },
    };
  });
}
