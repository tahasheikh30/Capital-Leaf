// Shown at once while the next page is being prepared, so a click always gets an immediate response.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      <div className="card">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-chart" />
      </div>
    </div>
  );
}
