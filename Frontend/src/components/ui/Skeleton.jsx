export function Skeleton({ width = '100%', height = 16, radius = 8 }) {
  return (
    <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />
  );
}
