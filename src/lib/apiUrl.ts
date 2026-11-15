// The backend address from NEXT_PUBLIC_API_URL, tidied up so small typos in the setting still work:
// spaces and a trailing slash are removed, and https:// is added if the scheme was left out.
export function cleanApiUrl(raw: string | undefined): string {
  let url = (raw ?? "").trim().replace(/\/+$/, "");
  if (!url) return "http://localhost:4000";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}
