import { startExpoAudioCapture } from "./ExpoAudioRecorder";

describe("startExpoAudioCapture", () => {
  it("yields one Uint8Array chunk after stop is called", async () => {
    const recording = {
      prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
      startAsync: jest.fn().mockResolvedValue(undefined),
      stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
      getURI: jest.fn().mockReturnValue("file:///tmp/rec.m4a"),
    };
    const audioApi = {
      requestPermissionsAsync: jest
        .fn()
        .mockResolvedValue({ granted: true, status: "granted" }),
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
      Recording: jest.fn().mockImplementation(() => recording),
      RecordingOptionsPresets: { HIGH_QUALITY: { ios: {}, android: {} } },
    };
    const fetchUri = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    const handle = await startExpoAudioCapture({
      audio: audioApi as never,
      fetchUri,
    });

    expect(audioApi.requestPermissionsAsync).toHaveBeenCalled();
    expect(recording.prepareToRecordAsync).toHaveBeenCalled();
    expect(recording.startAsync).toHaveBeenCalled();

    handle.stop();

    const chunks: Uint8Array[] = [];
    for await (const c of handle.audio) chunks.push(c);

    expect(recording.stopAndUnloadAsync).toHaveBeenCalled();
    expect(fetchUri).toHaveBeenCalledWith("file:///tmp/rec.m4a");
    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0])).toEqual([1, 2, 3]);
  });

  it("throws a permission-denied error when the User declines mic access", async () => {
    const audioApi = {
      requestPermissionsAsync: jest
        .fn()
        .mockResolvedValue({ granted: false, status: "denied" }),
      setAudioModeAsync: jest.fn(),
      Recording: jest.fn(),
      RecordingOptionsPresets: { HIGH_QUALITY: {} },
    };

    await expect(
      startExpoAudioCapture({
        audio: audioApi as never,
        fetchUri: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
