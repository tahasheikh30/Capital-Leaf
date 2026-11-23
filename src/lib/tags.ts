// Same rules as the server: lower case, single spaces, up to 24 letters, numbers, spaces, - or _.
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

export const normalizeTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
export const isValidTag = (t: string) => t.length >= 1 && t.length <= MAX_TAG_LENGTH && /^[\p{L}\p{N} _-]+$/u.test(t);

// Adds a typed tag to a list. Returns the new list, or an error message.
export function addTag(list: string[], raw: string): { tags: string[] } | { error: string } {
  const t = normalizeTag(raw.replace(/,/g, " "));
  if (!t) return { tags: list };
  if (!isValidTag(t)) return { error: t.length > MAX_TAG_LENGTH ? `Tags can be up to ${MAX_TAG_LENGTH} characters` : "Tags can use letters, numbers, spaces, - and _" };
  if (list.includes(t)) return { tags: list };
  if (list.length >= MAX_TAGS) return { error: `You can add up to ${MAX_TAGS} tags` };
  return { tags: [...list, t] };
}
