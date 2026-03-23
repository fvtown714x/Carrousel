import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUploadStream = vi.fn();

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: mockUploadStream,
    },
  },
}));

// Import after mock is set up
const { uploadVideo } = await import("./cloudinary.server");

describe("uploadVideo", () => {
  beforeEach(() => {
    mockUploadStream.mockReset();
  });

  it("resolves with the upload result on success", async () => {
    const fakeResult = { public_id: "shopify-videos/abc123", url: "https://res.cloudinary.com/demo/video/upload/abc123.mp4" };

    mockUploadStream.mockImplementation((_options, callback) => {
      const writable = {
        end: () => callback(null, fakeResult),
      };
      return writable;
    });

    const buffer = Buffer.from("fake-video-data");
    const result = await uploadVideo(buffer);

    expect(result).toEqual(fakeResult);
    expect(mockUploadStream).toHaveBeenCalledWith(
      { resource_type: "video", folder: "shopify-videos" },
      expect.any(Function)
    );
  });

  it("rejects when cloudinary returns an error", async () => {
    const fakeError = new Error("Upload failed");

    mockUploadStream.mockImplementation((_options, callback) => {
      const writable = {
        end: () => callback(fakeError, null),
      };
      return writable;
    });

    const buffer = Buffer.from("fake-video-data");
    await expect(uploadVideo(buffer)).rejects.toThrow("Upload failed");
  });
});
