/** Grid of placeholder cards matching the asset grid layout, to avoid layout shift. */
export function AssetGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="asset-grid" aria-busy="true" aria-label="Loading assets">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="asset-card">
          <div className="skeleton" style={{ aspectRatio: "16 / 9" }} />
          <div className="asset-card__body">
            <div className="skeleton skeleton-text" style={{ width: "60%" }} />
            <div className="skeleton skeleton-text" style={{ width: "40%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack stack--sm" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 56, borderRadius: "var(--radius-md)" }}
        />
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 104, borderRadius: "var(--radius-lg)" }}
        />
      ))}
    </div>
  );
}
