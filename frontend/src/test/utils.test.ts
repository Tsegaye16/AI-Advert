import { describe, expect, it } from "vitest";
import { aspectFor, mediaKindOf } from "../utils/media";
import { formatDuration, formatElapsed, formatRelative } from "../utils/time";
import { filenameForAsset, formatBytes } from "../utils/assetFiles";
import { buildSelectionPayload } from "../utils/providerSelection";
import type { Asset } from "../types";

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "abcdef12-3456-7890-abcd-ef1234567890",
    run_id: "run-1",
    campaign_id: "camp-1",
    kind: "image",
    step_name: "hero",
    provider: "nvidia",
    model: "flux",
    b2_key: "advault/campaigns/c/runs/r/hero.png",
    url: null,
    sha256: null,
    mime: "image/png",
    width: null,
    height: null,
    duration_ms: null,
    approved: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mediaKindOf", () => {
  it("treats final cuts as video", () => {
    expect(mediaKindOf(asset({ kind: "final", mime: "video/mp4" }))).toBe("video");
  });

  it("falls back to the asset kind when the mime type is generic", () => {
    expect(
      mediaKindOf(asset({ kind: "audio", mime: "application/octet-stream" })),
    ).toBe("audio");
  });
});

describe("aspectFor", () => {
  it("uses real dimensions so media is never cropped", () => {
    expect(aspectFor(asset({ width: 1080, height: 1920 }), "video")).toBe("1080 / 1920");
  });

  it("falls back per kind when dimensions are unknown", () => {
    expect(aspectFor(asset(), "video")).toBe("16 / 9");
    expect(aspectFor(asset(), "image")).toBe("4 / 3");
  });
});

describe("time formatting", () => {
  it("formats durations as m:ss", () => {
    expect(formatDuration(75_000)).toBe("1:15");
    expect(formatDuration(0)).toBeNull();
  });

  it("formats elapsed spans", () => {
    expect(formatElapsed("2026-01-01T00:00:00Z", "2026-01-01T00:00:42Z")).toBe("42s");
    expect(formatElapsed("2026-01-01T00:00:00Z", "2026-01-01T00:02:05Z")).toBe("2m 5s");
    expect(formatElapsed(null)).toBeNull();
  });

  it("handles missing timestamps", () => {
    expect(formatRelative(null)).toBe("—");
    expect(formatRelative("not-a-date")).toBe("—");
  });
});

describe("asset files", () => {
  it("derives a filename with the right extension", () => {
    expect(filenameForAsset(asset({ mime: "video/mp4", step_name: "compose" }))).toBe(
      "advault-compose-abcdef12.mp4",
    );
  });

  it("falls back to the storage key extension", () => {
    expect(
      filenameForAsset(
        asset({ mime: "application/octet-stream", b2_key: "a/b/thing.webp" }),
      ),
    ).toBe("advault-hero-abcdef12.webp");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(0)).toBe("—");
  });
});

describe("buildSelectionPayload", () => {
  it("omits slots with no override", () => {
    expect(buildSelectionPayload({ image_vendor: "nvidia" })).toEqual({
      image: { vendor: "nvidia" },
    });
  });

  it("returns undefined when nothing is selected", () => {
    expect(buildSelectionPayload({})).toBeUndefined();
  });
});
