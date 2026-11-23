export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Shrinks a phone photo before it is sent: the longest side is limited and it is saved as JPEG.
// A small photo that already fits is sent as it is. Returns an error message when the file cannot be used.
export async function preparePhoto(file: File, maxEdge = 1600, quality = 0.82): Promise<{ blob: Blob } | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "Choose an image file" };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && TYPES.includes(file.type) && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return { blob: file };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("no blob");
    return blob.size <= MAX_PHOTO_BYTES ? { blob } : { error: "That photo is too large" };
  } catch {
    // The browser could not read it (for example an unsupported format). Send it only if it is already acceptable.
    return TYPES.includes(file.type) && file.size <= MAX_PHOTO_BYTES ? { blob: file } : { error: "That photo could not be read. Try a JPEG or PNG." };
  }
}
