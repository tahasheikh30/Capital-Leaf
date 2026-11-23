import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS, biometricsSupported, enrollBiometric, readLock, removeBiometric, removeLock, setAutoLock, setPin, tryPin, unlockWithBiometric, validPin,
} from "@/lib/applock";

const U = "user-1";
beforeEach(() => localStorage.clear());

describe("PIN lock", () => {
  it("accepts 4 to 8 digits only", () => {
    for (const ok of ["1234", "12345678"]) expect(validPin(ok)).toBe(true);
    for (const bad of ["123", "123456789", "12a4", "", "12 34"]) expect(validPin(bad)).toBe(false);
  });
  it("stores a salted hash and never the PIN", async () => {
    await setPin(U, "4827");
    const raw = localStorage.getItem(`coinleaf.lock.${U}`)!;
    expect(raw).not.toContain("4827");
    expect(readLock(U)).toMatchObject({ failures: 0, lockedUntil: 0, autoLockSeconds: 60 });
    await setPin("user-2", "4827");
    expect(readLock("user-2")!.hash).not.toBe(readLock(U)!.hash);
  });
  it("refuses a bad PIN when setting", async () => {
    await expect(setPin(U, "12")).rejects.toThrow("4 to 8 digits");
    expect(readLock(U)).toBeNull();
  });
  it("unlocks with the right PIN and refuses a wrong one", async () => {
    await setPin(U, "4827");
    expect(await tryPin(U, "4827")).toEqual({ ok: true });
    expect(await tryPin(U, "0000")).toEqual({ ok: false, reason: "wrong", remaining: MAX_ATTEMPTS - 1, waitSeconds: undefined });
    expect(await tryPin(U, "4827")).toEqual({ ok: true });
    expect(readLock(U)!.failures).toBe(0);
  });
  it("says so when no lock is set", async () => {
    expect(await tryPin(U, "1234")).toEqual({ ok: false, reason: "none" });
  });
  it("makes the person wait after five wrong tries, longer after ten", async () => {
    await setPin(U, "4827");
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) await tryPin(U, "0000", t);
    const fifth = await tryPin(U, "0000", t);
    expect(fifth).toMatchObject({ ok: false, reason: "wrong", waitSeconds: 30 });
    // Even the right PIN is refused while waiting.
    expect(await tryPin(U, "4827", t + 5_000)).toEqual({ ok: false, reason: "cooldown", waitSeconds: 25 });
    expect(await tryPin(U, "4827", t + 31_000)).toEqual({ ok: true });
  });
  it("gives up after too many wrong tries so the caller can sign out", async () => {
    await setPin(U, "4827");
    let t = 0;
    let last;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      t += 10 * 60_000;
      last = await tryPin(U, "0000", t);
    }
    expect(last).toEqual({ ok: false, reason: "too-many" });
  });
  it("keeps the auto-lock time when the PIN changes", async () => {
    await setPin(U, "4827");
    setAutoLock(U, 300);
    await setPin(U, "9999");
    expect(readLock(U)!.autoLockSeconds).toBe(300);
    expect(await tryPin(U, "9999")).toEqual({ ok: true });
  });
  it("removes the lock", async () => {
    await setPin(U, "4827");
    removeLock(U);
    expect(readLock(U)).toBeNull();
  });
  it("ignores unreadable stored data", () => {
    localStorage.setItem(`coinleaf.lock.${U}`, "{not json");
    expect(readLock(U)).toBeNull();
  });
});

describe("biometric unlock", () => {
  const create = vi.fn();
  const get = vi.fn();
  beforeEach(() => {
    create.mockReset();
    get.mockReset();
    Object.defineProperty(navigator, "credentials", { value: { create, get }, configurable: true });
  });

  it("needs a PIN first", async () => {
    await expect(enrollBiometric(U, "a@b.co")).rejects.toThrow("Set a PIN first");
  });
  it("saves the credential and unlocks with it", async () => {
    await setPin(U, "4827");
    create.mockResolvedValue({ rawId: new Uint8Array([1, 2, 3]).buffer });
    await enrollBiometric(U, "a@b.co");
    expect(create.mock.calls[0][0].publicKey.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", userVerification: "required" });
    expect(readLock(U)!.credentialId).toBeTruthy();
    get.mockResolvedValue({ id: "x" });
    expect(await unlockWithBiometric(U)).toBe(true);
    expect(get.mock.calls[0][0].publicKey.userVerification).toBe("required");
  });
  it("fails closed when the prompt is cancelled or nothing is enrolled", async () => {
    await setPin(U, "4827");
    expect(await unlockWithBiometric(U)).toBe(false);
    create.mockResolvedValue({ rawId: new Uint8Array([9]).buffer });
    await enrollBiometric(U, "a@b.co");
    get.mockRejectedValue(new Error("NotAllowedError"));
    expect(await unlockWithBiometric(U)).toBe(false);
    get.mockResolvedValue(null);
    expect(await unlockWithBiometric(U)).toBe(false);
  });
  it("reports a cancelled setup and can be turned off", async () => {
    await setPin(U, "4827");
    create.mockResolvedValue(null);
    await expect(enrollBiometric(U, "a@b.co")).rejects.toThrow("cancelled");
    create.mockResolvedValue({ rawId: new Uint8Array([9]).buffer });
    await enrollBiometric(U, "a@b.co");
    removeBiometric(U);
    expect(readLock(U)!.credentialId).toBeUndefined();
  });
  it("detects support", async () => {
    expect(await biometricsSupported()).toBe(false);
    vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: async () => true });
    Object.defineProperty(window, "PublicKeyCredential", { value: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true }, configurable: true });
    expect(await biometricsSupported()).toBe(true);
    vi.unstubAllGlobals();
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true });
  });
});
