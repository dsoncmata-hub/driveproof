import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(),
  getBlob: vi.fn(),
  putBlob: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("./supabase", () => ({
  supabase: { storage: { from: () => ({ download: mocks.download, upload: mocks.upload }) } },
}));
vi.mock("./blobs", () => ({ getBlob: mocks.getBlob, putBlob: mocks.putBlob }));
vi.mock("./cloudSync", () => ({ checkCloudIdentity: mocks.identity }));
import { evidenceObjectPath, recoverEvidence, uploadEvidence } from "./evidenceCloud";
import { sha256OfBlob } from "./hash";
import type { Evidence } from "./types";
const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
let evidence: Evidence;
beforeEach(async () => {
  evidence = {
    id: "photoA",
    tripId: null,
    fuelingId: null,
    category: "painel",
    fileName: "original.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 3,
    capturedAt: 1,
    lat: null,
    lon: null,
    sha256: await sha256OfBlob(blob),
    inAppCapture: true,
    note: "",
    syncState: "local",
  };
  mocks.getBlob.mockResolvedValue(null);
  mocks.identity.mockResolvedValue(undefined);
  mocks.download.mockResolvedValue({ data: blob, error: null });
  mocks.upload.mockResolvedValue({ error: null });
});
describe("original photo integrity", () => {
  it("downloads and persists exactly the verified original", async () => {
    expect(await recoverEvidence("accountA", evidence)).toBe("recovered");
    expect(mocks.putBlob).toHaveBeenCalledWith("photoA", blob);
    expect(mocks.download).toHaveBeenCalledWith(evidenceObjectPath("accountA", evidence));
  });
  it("rejects a corrupted remote original without storing it", async () => {
    mocks.download.mockResolvedValue({
      data: new Blob(["bad"], { type: "image/jpeg" }),
      error: null,
    });
    await expect(recoverEvidence("accountA", evidence)).rejects.toThrow(/SHA-256/);
    expect(mocks.putBlob).not.toHaveBeenCalled();
  });
  it("preserves a corrupted local original and reports the mismatch", async () => {
    mocks.getBlob.mockResolvedValue(new Blob(["bad"], { type: "image/jpeg" }));
    await expect(recoverEvidence("accountA", evidence)).rejects.toThrow(/preservado/);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("verifies a duplicate remote object instead of assuming success", async () => {
    mocks.getBlob.mockResolvedValue(blob);
    mocks.upload.mockResolvedValue({ error: { message: "already exists" } });
    expect(await uploadEvidence("accountA", evidence)).toBe("existing");
    expect(mocks.download).toHaveBeenCalled();
  });
  it("rejects a duplicate object with different bytes", async () => {
    mocks.getBlob.mockResolvedValue(blob);
    mocks.upload.mockResolvedValue({ error: { message: "already exists" } });
    mocks.download.mockResolvedValue({
      data: new Blob(["bad"], { type: "image/jpeg" }),
      error: null,
    });
    await expect(uploadEvidence("accountA", evidence)).rejects.toThrow(/SHA-256/);
  });
  it("never overwrites immutable remote originals", async () => {
    mocks.getBlob.mockResolvedValue(blob);
    await uploadEvidence("accountA", evidence);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.any(String),
      blob,
      expect.objectContaining({ upsert: false }),
    );
  });
  it("blocks path traversal", () => {
    expect(() => evidenceObjectPath("accountA", { ...evidence, id: "../other" })).toThrow();
  });
});
