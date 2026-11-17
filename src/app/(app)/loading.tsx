import TreeLoader from "@/components/TreeLoader";

// Shown at once while the next page is being prepared. It fades in after a moment, so quick page changes do not flash.
export default function Loading() {
  return (
    <div className="tree-wait" role="status" aria-busy="true">
      <TreeLoader size={104} label="Loading" />
      <p>Growing your numbers</p>
    </div>
  );
}
