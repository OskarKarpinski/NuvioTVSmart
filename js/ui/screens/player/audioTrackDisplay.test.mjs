import test from "node:test";
import assert from "node:assert/strict";

// The player helper pulls profile-scoped stores at import time; the display
// rules under test never read them, so an empty storage keeps the import quiet.
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};

const { formatAudioTrackDisplay } =
  await import("./playerScreenHelpers-07-detect-track-language-variant.js");

test("audio track metadata matches Android's codec | channels | sample rate line", () => {
  assert.equal(
    formatAudioTrackDisplay({ codec: "eac3", channelCount: 6, sampleRate: 48000 }, 0).metadata,
    "E-AC-3 | 6 ch | 48 kHz"
  );
  assert.equal(
    formatAudioTrackDisplay({ codec: "ac3", channels: "2", audioSampleRate: 44100 }, 0).metadata,
    "AC-3 | 2 ch | 44 kHz"
  );
});

test("audio track metadata omits fields the stream does not expose", () => {
  assert.equal(formatAudioTrackDisplay({ codec: "aac" }, 0).metadata, "AAC");
  assert.equal(formatAudioTrackDisplay({ sel: true }, 0).metadata, "");
});

test("Vega OS correctly identifies unsupported audio codecs (DTS, TrueHD) and marks conversion capability", async () => {
  const { Environment } = await import("../../../platform/environment.js");
  const { getAudioTrackSupportState, isUnsupportedVegaAudioTrack } =
    await import("./playerScreenHelpers-04-format-subtitle-codec-label.js");

  const originalIsVega = Environment.isVega;
  Environment.isVega = () => true;

  try {
    const dtsTrack = { codec: "dts-hd", audioCodec: "dts-hd ma", name: "English DTS-HD MA 5.1" };
    assert.equal(isUnsupportedVegaAudioTrack(dtsTrack), true);
    const dtsSupport = getAudioTrackSupportState(dtsTrack);
    assert.equal(dtsSupport.supported, false);
    assert.equal(dtsSupport.canTryAudioConversion, false);
    assert.equal(dtsSupport.unsupportedReason, "codec");

    const trueHdTrack = { codec: "truehd", audioCodec: "truehd", name: "Dolby TrueHD 7.1" };
    assert.equal(isUnsupportedVegaAudioTrack(trueHdTrack), true);
    const trueHdSupport = getAudioTrackSupportState(trueHdTrack);
    assert.equal(trueHdSupport.supported, false);
    assert.equal(trueHdSupport.canTryAudioConversion, false);

    const ac3Track = { codec: "ac3", audioCodec: "ac3", name: "English AC3 5.1" };
    assert.equal(isUnsupportedVegaAudioTrack(ac3Track), false);
    const ac3Support = getAudioTrackSupportState(ac3Track);
    assert.equal(ac3Support.supported, true);
    assert.equal(ac3Support.canTryAudioConversion, false);

    const aacTrack = { codec: "aac", audioCodec: "mp4a", name: "Stereo AAC" };
    assert.equal(isUnsupportedVegaAudioTrack(aacTrack), false);
    const aacSupport = getAudioTrackSupportState(aacTrack);
    assert.equal(aacSupport.supported, true);
    assert.equal(aacSupport.canTryAudioConversion, false);
  } finally {
    Environment.isVega = originalIsVega;
  }
});
