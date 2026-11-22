import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePhoto } from "@/lib/image";

const file = (type: string, size: number, name = "p") => new File([new Uint8Array(size)], name, { type });
afterEach(() => vi.unstubAllGlobals());

function stubCanvas(blobSize: number | null, width = 4000, height = 3000) {
  const drawImage = vi.fn();
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close })));
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage, fillStyle: "" }), toBlob: (cb: (b: Blob | null) => void) => cb(blobSize === null ? null : new Blob([new Uint8Array(blobSize)], { type: "image/jpeg" })) };
  const real = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => (tag === "canvas" ? canvas : real(tag))) as typeof document.createElement);
  return { canvas, drawImage, close };
}

describe("preparePhoto", () => {
  it("refuses things that are not images", async () => expect(await preparePhoto(file("application/pdf", 10))).toEqual({ error: "Choose an image file" }));
  it("shrinks a large photo to the longest side and saves it as JPEG", async () => {
    const { canvas, drawImage, close } = stubCanvas(200_000);
    const r = await preparePhoto(file("image/jpeg", 6_000_000));
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect("blob" in r && r.blob.type).toBe("image/jpeg");
  });
  it("sends a small photo as it is", async () => {
    const { drawImage } = stubCanvas(1, 800, 600);
    const f = file("image/png", 50_000);
    expect(await preparePhoto(f)).toEqual({ blob: f });
    expect(drawImage).not.toHaveBeenCalled();
  });
  it("re-encodes a small photo that is not JPEG, PNG or WebP", async () => {
    stubCanvas(30_000, 800, 600);
    const r = await preparePhoto(file("image/gif", 50_000));
    expect("blob" in r && r.blob.type).toBe("image/jpeg");
  });
  it("refuses a result that is still too large", async () => {
    stubCanvas(6 * 1024 * 1024);
    expect(await preparePhoto(file("image/jpeg", 9_000_000))).toEqual({ error: "That photo is too large" });
  });
  it("falls back to the original when the browser cannot decode it but it is acceptable", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad"); }));
    const f = file("image/jpeg", 100);
    expect(await preparePhoto(f)).toEqual({ blob: f });
  });
  it("refuses an unreadable file that is not acceptable as it is", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad"); }));
    expect(await preparePhoto(file("image/heic", 100))).toEqual({ error: "That photo could not be read. Try a JPEG or PNG." });
    expect(await preparePhoto(file("image/jpeg", 6 * 1024 * 1024))).toMatchObject({ error: expect.any(String) });
  });
  it("falls back when no blob can be made", async () => {
    stubCanvas(null);
    const f = file("image/jpeg", 3_000_000);
    expect(await preparePhoto(f)).toEqual({ blob: f });
  });
});
