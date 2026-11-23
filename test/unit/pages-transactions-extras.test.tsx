import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, field, renderApp, uid } from "../utils";

const s = vi.hoisted(() => ({
  impl: (async () => ({})) as (p: string, o?: unknown) => Promise<unknown>,
  peek: vi.fn(() => undefined),
  upload: vi.fn(async (_path: string, _blob: Blob): Promise<void> => undefined),
  blob: vi.fn(async (_path: string): Promise<Blob> => new Blob(["img"], { type: "image/jpeg" })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/transactions" }));
vi.mock("@/lib/api", () => ({ api: (p: string, o?: unknown) => s.impl(p, o), peek: s.peek, setApiSpace: vi.fn(), clearApiCache: vi.fn(), requestsWaiting: () => 0, API_URL: "http://api.test", uploadFile: (p: string, b: Blob) => s.upload(p, b), fetchBlob: (p: string) => s.blob(p) }));
vi.mock("@/lib/image", () => ({ preparePhoto: vi.fn(async (f: File) => (f.type.startsWith("image/") ? { blob: f } : { error: "Choose an image file" })) }));

import TransactionsPage from "@/app/(app)/transactions/page";
import { monthKey } from "@/lib/format";

let api: ReturnType<typeof fakeApi>;
const use = (routes: Parameters<typeof fakeApi>[0]) => { api = fakeApi({ "/households/me": { household: null }, "/ai/status": { available: false, enabled: false }, "/assets": [], ...routes }); s.impl = api.impl as typeof s.impl; };
const month = monthKey(new Date());
const CATS = [{ id: uid(10), name: "Food", color: "#112233" }, { id: uid(11), name: "Fuel", color: "#445566" }];
const tx = (n: number, extra: Record<string, unknown> = {}) => ({ id: uid(100 + n), type: "expense", amount: 100 * n, occurred_on: "2026-11-05", note: null, category_id: null, income_source_id: null, recurring_id: null, tags: [], receipt_path: null, ...extra });
const TX = [tx(1, { note: "Lunch", tags: ["business", "reimbursable"] }), tx(2, { note: "Petrol", receipt_path: "x/y.jpg" })];
const base = (more: Parameters<typeof fakeApi>[0] = {}) => use({ [`/transactions?month=${month}`]: TX, "/categories": CATS, "/income-sources": [], "/transactions/tags": [{ tag: "business", count: 3 }, { tag: "trip", count: 1 }], ...more });
const open = async () => { renderApp(<TransactionsPage />); await screen.findByText("Lunch"); };
const searches = () => api.calls.filter((c) => c.path.startsWith("/transactions/search"));
const lastSearch = () => new URL("http://x" + searches().at(-1)!.path).searchParams;

beforeEach(() => { s.peek.mockReturnValue(undefined); s.upload.mockClear(); s.blob.mockClear(); vi.stubGlobal("confirm", vi.fn(() => true)); URL.createObjectURL = vi.fn(() => "blob:preview"); URL.revokeObjectURL = vi.fn(); });

describe("Transactions tags and photos", () => {
  it("shows tags under the note", async () => {
    base();
    await open();
    const row = screen.getByText("Lunch").closest("tr")!;
    expect(within(row).getByText("business")).toBeInTheDocument();
    expect(within(row).getByText("reimbursable")).toBeInTheDocument();
  });
  it("only rows with a photo get a photo button", async () => {
    base();
    await open();
    expect(screen.getAllByRole("button", { name: /View photo/ })).toHaveLength(1);
    expect(within(screen.getByText("Petrol").closest("tr")!).getByRole("button", { name: /View photo/ })).toBeInTheDocument();
  });
  it("opens the photo", async () => {
    base();
    await open();
    await userEvent.click(screen.getByRole("button", { name: /View photo/ }));
    expect(await screen.findByAltText(/Receipt for/)).toHaveAttribute("src", "blob:preview");
    expect(s.blob).toHaveBeenCalledWith(`/transactions/${uid(102)}/receipt`);
  });
  it("says when the photo cannot be loaded", async () => {
    base();
    s.blob.mockRejectedValueOnce(new Error("No photo on this transaction"));
    await open();
    await userEvent.click(screen.getByRole("button", { name: /View photo/ }));
    expect(await screen.findByText("No photo on this transaction")).toBeInTheDocument();
  });
  it("sends tags and a longer note with a new transaction", async () => {
    base();
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "50");
    await userEvent.type(field("Note"), "Client lunch");
    await userEvent.type(field("Tags"), "Business{Enter}trip,");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.sent("POST", "/transactions")).toHaveLength(1));
    expect(api.sent("POST", "/transactions")[0].body).toMatchObject({ note: "Client lunch", tags: ["business", "trip"] });
    expect(s.upload).not.toHaveBeenCalled();
  });
  it("uploads the chosen photo after saving", async () => {
    base({ "POST /transactions": { id: uid(300) } });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "50");
    const photo = new File(["x"], "r.jpg", { type: "image/jpeg" });
    await userEvent.upload(document.getElementById("receipt-file") as HTMLInputElement, photo);
    expect(await screen.findByAltText("Receipt")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(s.upload).toHaveBeenCalledWith(`/transactions/${uid(300)}/receipt`, photo));
  });
  it("tells you when the transaction saved but the photo did not", async () => {
    base({ "POST /transactions": { id: uid(300) } });
    s.upload.mockRejectedValueOnce(new Error("Cannot reach the server."));
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    await userEvent.type(field("Amount"), "5");
    await userEvent.upload(document.getElementById("receipt-file") as HTMLInputElement, new File(["x"], "r.png", { type: "image/png" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/Saved, but the photo was not uploaded: Cannot reach the server/)).toBeInTheDocument();
  });
  it("refuses a file that is not an image", async () => {
    base();
    await open();
    await userEvent.click(screen.getByRole("button", { name: /Add$/ }));
    fireEvent.change(document.getElementById("receipt-file") as HTMLInputElement, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("Choose an image file")).toBeInTheDocument();
    expect(screen.queryByAltText("Receipt")).toBeNull();
  });
  it("edit shows the saved photo and tags, and can remove the photo", async () => {
    base();
    await open();
    await userEvent.click(within(screen.getByText("Petrol").closest("tr")!).getByRole("button", { name: "Edit" }));
    expect(await screen.findByAltText("Receipt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByAltText("Receipt")).toBeNull();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("DELETE", `/transactions/${uid(102)}/receipt`)).toHaveLength(1));
  });
  it("edit fills in tags and can replace the photo", async () => {
    base();
    await open();
    await userEvent.click(within(screen.getByText("Lunch").closest("tr")!).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Remove tag business" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove tag reimbursable" }));
    const photo = new File(["x"], "r.webp", { type: "image/webp" });
    await userEvent.upload(document.getElementById("receipt-file") as HTMLInputElement, photo);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.sent("PATCH", `/transactions/${uid(101)}`)).toHaveLength(1));
    expect(api.sent("PATCH", `/transactions/${uid(101)}`)[0].body).toMatchObject({ tags: ["business"] });
    await waitFor(() => expect(s.upload).toHaveBeenCalledWith(`/transactions/${uid(101)}/receipt`, photo));
  });
});

describe("Transactions search and filters", () => {
  const found = (items: unknown[], total = items.length) => ({ items, total });
  it("does not search until a filter is used", async () => {
    base();
    await open();
    expect(searches()).toHaveLength(0);
    expect(screen.getByText("Earned")).toBeInTheDocument();
  });
  it("searches the selected month by text", async () => {
    base({ "/transactions/search": found([tx(2, { note: "Petrol" })]) });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "petrol");
    await waitFor(() => expect(lastSearch().get("q")).toBe("petrol"));
    expect(lastSearch().get("from")).toBe(`${month}-01`);
    expect(await screen.findByText("1 match")).toBeInTheDocument();
    expect(screen.queryByText("Earned")).toBeNull();
  });
  it("shows only what the search returns", async () => {
    base({ "/transactions/search": found([tx(2, { note: "Petrol" })]) });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "pet");
    await screen.findByText("1 match");
    expect(screen.queryByText("Lunch")).toBeNull();
    expect(screen.getByText("Petrol")).toBeInTheDocument();
  });
  it("says when nothing matches", async () => {
    base({ "/transactions/search": found([]) });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "zzz");
    expect(await screen.findByText("Nothing matches these filters.")).toBeInTheDocument();
    expect(screen.getByText("0 matches")).toBeInTheDocument();
  });
  it("filters by type, category, amounts, photo and period", async () => {
    base({ "/transactions/search": found([]) });
    await open();
    await userEvent.selectOptions(screen.getByLabelText("Show"), "expense");
    await userEvent.selectOptions(screen.getByLabelText("In category"), uid(11));
    await userEvent.type(screen.getByLabelText("Smallest amount"), "10");
    await userEvent.type(screen.getByLabelText("Largest amount"), "99.5");
    await userEvent.selectOptions(screen.getByLabelText("Photo"), "yes");
    await userEvent.selectOptions(screen.getByLabelText("Period"), "all");
    await waitFor(() => expect(Object.fromEntries(lastSearch())).toEqual({ type: "expense", category: uid(11), min: "10", max: "99.5", receipt: "true", limit: "50" }));
  });
  it("can look for uncategorised expenses", async () => {
    base({ "/transactions/search": found([]) });
    await open();
    await userEvent.selectOptions(screen.getByLabelText("In category"), "none");
    await waitFor(() => expect(lastSearch().get("category")).toBe("none"));
  });
  it("searches custom dates", async () => {
    base({ "/transactions/search": found([]) });
    await open();
    await userEvent.selectOptions(screen.getByLabelText("Period"), "custom");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    await waitFor(() => expect(lastSearch().get("to")).toBe("2026-03-31"));
    expect(lastSearch().get("from")).toBe("2026-01-01");
  });
  it("offers popular tags as filters and combines them", async () => {
    base({ "/transactions/search": found([]) });
    await open();
    const group = screen.getByRole("group", { name: "Filter by tag" });
    await userEvent.click(within(group).getByRole("button", { name: "#business" }));
    await userEvent.click(within(group).getByRole("button", { name: "#trip" }));
    await waitFor(() => expect(lastSearch().get("tags")).toBe("business,trip"));
    expect(within(group).getByRole("button", { name: "#business" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(group).getByRole("button", { name: "#business" }));
    await waitFor(() => expect(lastSearch().get("tags")).toBe("trip"));
  });
  it("hides the tag chips when there are no tags yet", async () => {
    base({ "/transactions/tags": [] });
    await open();
    expect(screen.queryByRole("group", { name: "Filter by tag" })).toBeNull();
  });
  it("loads more results", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => tx(i + 1, { note: `n${i + 1}` }));
    const more = [tx(60, { note: "last one" })];
    base({ "/transactions/search": ({ path }: { path: string }) => (path.includes("offset=50") ? found(more, 51) : found(page1, 51)) });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "n");
    await screen.findByText("51 matches");
    await userEvent.click(screen.getByRole("button", { name: "Show more (1 left)" }));
    expect(await screen.findByText("last one")).toBeInTheDocument();
    expect(lastSearch().get("offset")).toBe("50");
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });
  it("clearing filters returns to the month", async () => {
    base({ "/transactions/search": found([]) });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "q");
    await screen.findByText("0 matches");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Earned")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
  it("shows the error when the search fails", async () => {
    base({ "/transactions/search": new Error("The smallest amount is above the largest") });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "q");
    expect(await screen.findByText("The smallest amount is above the largest")).toBeInTheDocument();
  });
  it("deleting inside search results refreshes the search", async () => {
    base({ "/transactions/search": found([tx(2, { note: "Petrol" })]) });
    await open();
    await userEvent.type(screen.getByLabelText("Search"), "pet");
    await screen.findByText("1 match");
    const before = searches().length;
    await userEvent.click(within(screen.getByText("Petrol").closest("tr")!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.sent("DELETE", `/transactions/${uid(102)}`)).toHaveLength(1));
    await waitFor(() => expect(searches().length).toBeGreaterThan(before));
  });
});
