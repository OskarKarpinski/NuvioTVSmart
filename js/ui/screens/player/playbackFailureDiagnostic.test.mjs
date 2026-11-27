import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeStreamCodecs,
  diagnosePlaybackFailure,
  extractHostName
} from "./playbackFailureDiagnostic.js";

test("analyzeStreamCodecs detects DTS, HEVC 10-bit, 1080p, MKV and Remux", () => {
  const title = "Mr.Robot.S01E01.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1.mkv";
  const codecs = analyzeStreamCodecs(title, "https://debrid.example.com/file.mkv");
  assert.equal(codecs.resolution, "1080p FHD");
  assert.equal(codecs.sourceQuality, "Remux (bezstratny)");
  assert.equal(codecs.container, "MKV");
  assert.ok(codecs.audio.includes("DTS-HD MA"));
  assert.ok(codecs.video.includes("H.264 (AVC)"));
});

test("diagnosePlaybackFailure flags DTS on Fire TV Vega as format incompatibility", () => {
  const result = diagnosePlaybackFailure({
    candidate: { name: "Mr.Robot.S01E01.1080p.BluRay.x264.DTS-HD.MA.5.1" },
    playbackUrl: "https://rd.example.com/video.mkv",
    reason: "startup-stall",
    platform: "vega"
  });
  assert.equal(result.category, "format");
  assert.ok(result.explanation.includes("DTS"));
  assert.ok(result.recommendation.includes("AAC"));
});

test("diagnosePlaybackFailure flags HTTP 403 as debrid / host expiration", () => {
  const result = diagnosePlaybackFailure({
    httpStatus: 403,
    candidate: { name: "Breaking.Bad.S01E01.720p.mkv" },
    playbackUrl: "https://torrentio.strem.fun/stream"
  });
  assert.equal(result.category, "host");
  assert.ok(result.explanation.includes("Real-Debrid"));
});

test("diagnosePlaybackFailure identifies startup stall", () => {
  const result = diagnosePlaybackFailure({
    reason: "startup-stall",
    candidate: { name: "Breaking.Bad.S01E01.720p.mp4" },
    playbackUrl: "https://source.example.com/stream.mp4"
  });
  assert.equal(result.category, "stall");
  assert.ok(result.badge.includes("Stall"));
});

test("analyzeStreamCodecs does not treat DVDRip or .dev URL as Dolby Vision", () => {
  const codecs = analyzeStreamCodecs(
    "Movie.2024.1080p.DVDRip.x264.AAC",
    "https://pixeldrain.dev/api/file/7raRDQU4?download"
  );
  assert.equal(codecs.hdr.includes("Dolby Vision"), false);
});

test("diagnosePlaybackFailure flags E-AC3/DDP on Fire TV Vega during preroll timeout or stall", () => {
  const result = diagnosePlaybackFailure({
    candidate: {
      name: "Mr.Robot.S02E01-E02.1080p.BluRay.10bit.HEVC.[Hindi.DDP.5.1+English.AAC.5.1].mkv"
    },
    playbackUrl: "https://pixeldrain.dev/api/file/7raRDQU4?download",
    reason: "native-preroll-timeout",
    runtimeDetail: "Vega native player preroll timeout",
    platform: "vega"
  });
  assert.equal(result.category, "format");
  assert.ok(result.explanation.includes("E-AC3/DDP"));
});

test("diagnosePlaybackFailure uses native GStreamer audio signature, not only the filename", () => {
  const result = diagnosePlaybackFailure({
    mediaErrorCode: 3,
    candidate: { name: "Movie.2024.1080p.HEVC.mkv" },
    playbackUrl: "https://source.example.com/stream.mkv",
    reason: "native-media-error",
    runtimeDetail:
      "WARN bin gstbin.c Name 'audiodecoder' is not unique in bin, not adding; ERROR PlaybackPipelineBuilderImpl.cpp Failed to link inputMultiQueueSrc to decoderSink; audio/x-eac3",
    platform: "vega"
  });
  assert.equal(result.category, "format");
  assert.match(result.title, /Błąd dekodowania audio/);
  assert.ok(result.explanation.includes("E-AC3/DDP"));
});
