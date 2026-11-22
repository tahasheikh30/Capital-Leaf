// A screen lock for this device: a PIN, and optionally the phone's fingerprint or face unlock.
// It keeps whoever picks up an unlocked phone out of the app. It lives on the device only: the PIN is
// never sent anywhere (only a salted hash is kept), and it does not replace the account password.

const KEY = (userId: string) => `coinleaf.lock.${userId}`;
const ITERATIONS = 150_000;
export const MAX_ATTEMPTS = 10;
export const AUTO_LOCK_CHOICES = [
  { seconds: 0, label: "Right away" },
  { seconds: 60, label: "After 1 minute" },
  { seconds: 300, label: "After 5 minutes" },
  { seconds: 900, label: "After 15 minutes" },
] as const;

export type LockSettings = {
  salt: string;
  hash: string;
  autoLockSeconds: number;
  credentialId?: string;
  failures: number;
  lockedUntil: number;
};

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function readLock(userId: string): LockSettings | null {
  try {
    const raw = localStorage.getItem(KEY(userId));
    return raw ? (JSON.parse(raw) as LockSettings) : null;
  } catch {
    return null;
  }
}
function writeLock(userId: string, value: LockSettings) {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(value));
  } catch {
    // Storage can be blocked (private windows); the lock then simply cannot be saved.
  }
}
export function removeLock(userId: string) {
  try {
    localStorage.removeItem(KEY(userId));
  } catch {
    /* nothing to remove */
  }
}

export const validPin = (pin: string) => /^\d{4,8}$/.test(pin);

async function hashPin(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS }, key, 256);
  return b64(bits);
}

export async function setPin(userId: string, pin: string, autoLockSeconds = 60) {
  if (!validPin(pin)) throw new Error("Use 4 to 8 digits for your PIN");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const previous = readLock(userId);
  writeLock(userId, { salt: b64(salt), hash: await hashPin(pin, salt), autoLockSeconds: previous?.autoLockSeconds ?? autoLockSeconds, credentialId: previous?.credentialId, failures: 0, lockedUntil: 0 });
}

export function setAutoLock(userId: string, seconds: number) {
  const s = readLock(userId);
  if (s) writeLock(userId, { ...s, autoLockSeconds: seconds });
}

export type Attempt = { ok: true } | { ok: false; reason: "wrong" | "cooldown" | "too-many" | "none"; remaining?: number; waitSeconds?: number };

// Checks a PIN. Wrong tries slow down (30 seconds, doubling after every 5), and after MAX_ATTEMPTS the caller signs the person out.
export async function tryPin(userId: string, pin: string, now = Date.now()): Promise<Attempt> {
  const s = readLock(userId);
  if (!s) return { ok: false, reason: "none" };
  if (s.lockedUntil > now) return { ok: false, reason: "cooldown", waitSeconds: Math.ceil((s.lockedUntil - now) / 1000) };
  const match = (await hashPin(pin, unb64(s.salt))) === s.hash;
  if (match) {
    writeLock(userId, { ...s, failures: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const failures = s.failures + 1;
  if (failures >= MAX_ATTEMPTS) return { ok: false, reason: "too-many" };
  const wait = failures % 5 === 0 ? 30 * 2 ** (failures / 5 - 1) : 0;
  writeLock(userId, { ...s, failures, lockedUntil: wait ? now + wait * 1000 : 0 });
  return { ok: false, reason: "wrong", remaining: MAX_ATTEMPTS - failures, waitSeconds: wait || undefined };
}

// Fingerprint or face unlock through the device's own authenticator (WebAuthn). The result stays on the device.
export const biometricsSupported = async () => {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
};

export async function enrollBiometric(userId: string, label: string) {
  const s = readLock(userId);
  if (!s) throw new Error("Set a PIN first");
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "CoinLeaf" },
      user: { id: new TextEncoder().encode(userId), name: label, displayName: label },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric setup was cancelled");
  writeLock(userId, { ...s, credentialId: b64(cred.rawId) });
}

export function removeBiometric(userId: string) {
  const s = readLock(userId);
  if (s) writeLock(userId, { ...s, credentialId: undefined });
}

export async function unlockWithBiometric(userId: string): Promise<boolean> {
  const s = readLock(userId);
  if (!s?.credentialId) return false;
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: unb64(s.credentialId) as BufferSource }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    if (got) writeLock(userId, { ...s, failures: 0, lockedUntil: 0 });
    return !!got;
  } catch {
    return false;
  }
}
