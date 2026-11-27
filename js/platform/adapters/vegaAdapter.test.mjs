import test from "node:test";
import assert from "node:assert/strict";
import { createVegaPlayerBridge, vegaAdapter } from "./vegaAdapter.js";
import { Platform } from "../index.js";

test("vegaAdapter reports Vega OS metadata and capabilities", () => {
  assert.equal(vegaAdapter.name, "vega");
  assert.equal(vegaAdapter.getDeviceLabel(), "Amazon Fire TV (Vega OS)");

  const caps = vegaAdapter.getCapabilities();
  assert.equal(caps.nativeVideo, true);
  assert.equal(caps.webosAvplay, false);
  assert.equal(caps.tizenAvplay, false);
  assert.equal(caps.vegaAvplay, true);
});

test("createVegaPlayerBridge drives native player lifecycle and callbacks", () => {
  const previousBridge = globalThis.ReactNativeWebView;
  const messages = [];
  globalThis.ReactNativeWebView = {
    postMessage(msg) {
      messages.push(JSON.parse(msg));
    }
  };

  const previousPlayer = globalThis.__NUVIO_VEGA_PLAYER__;
  delete globalThis.__NUVIO_VEGA_PLAYER__;
  try {
    const bridge = vegaAdapter.init() || globalThis.__NUVIO_VEGA_PLAYER__;
    assert.ok(bridge);

    let preparedFired = false;
    let timeUpdates = [];
    bridge.setListener({
      oncurrentplaytime(ms) {
        timeUpdates.push(ms);
      }
    });

    bridge.open("https://example.com/test.mkv");
    assert.equal(bridge.getState(), "IDLE");
    assert.deepEqual(messages[0], {
      type: "NUVIO_VEGA_PLAYER",
      action: "open",
      url: "https://example.com/test.mkv",
      headers: {}
    });

    bridge.prepareAsync(
      () => {
        preparedFired = true;
      },
      () => {}
    );
    assert.deepEqual(messages[1], { type: "NUVIO_VEGA_PLAYER", action: "prepare", headers: {} });

    bridge._handleNativeEvent({ name: "canplay", duration: 120.5 });
    assert.equal(preparedFired, true);
    assert.equal(bridge.getState(), "READY");
    assert.equal(bridge.getDuration(), 120500);

    bridge.play();
    assert.equal(bridge.getState(), "PLAYING");
    assert.deepEqual(messages[2], { type: "NUVIO_VEGA_PLAYER", action: "play" });

    bridge._handleNativeEvent({ name: "timeupdate", currentTime: 10.25 });
    assert.equal(bridge.getCurrentTime(), 10250);
    assert.deepEqual(timeUpdates, [10250]);

    bridge.pause();
    assert.equal(bridge.getState(), "PAUSED");
    assert.deepEqual(messages[3], { type: "NUVIO_VEGA_PLAYER", action: "pause" });

    bridge.seekTo(30000);
    assert.deepEqual(messages[4], { type: "NUVIO_VEGA_PLAYER", action: "seek", positionMs: 30000 });

    bridge.stop();
    assert.equal(bridge.getState(), "IDLE");
    assert.deepEqual(messages[5], { type: "NUVIO_VEGA_PLAYER", action: "stop" });

    bridge.close();
    assert.equal(bridge.getState(), "NONE");
    assert.deepEqual(messages[6], { type: "NUVIO_VEGA_PLAYER", action: "close" });

    // Test audio tracks handling
    bridge.open("https://example.com/stream.mp4");
    bridge._handleNativeEvent({
      name: "loadedmetadata",
      audioTracks: [
        { index: 0, label: "English", language: "eng", enabled: true },
        { index: 1, label: "Polish", language: "pol", enabled: false }
      ]
    });
    const totalTracks = bridge.getTotalTrackInfo();
    assert.equal(totalTracks.length, 2);
    assert.equal(totalTracks[0].name, "English");
    assert.equal(totalTracks[1].extra_info.track_lang, "pol");

    const currentStream = bridge.getCurrentStreamInfo();
    assert.equal(currentStream.length, 1);
    assert.equal(currentStream[0].index, 0);

    bridge.setSelectTrack("AUDIO", 1);
    assert.deepEqual(messages[messages.length - 1], {
      type: "NUVIO_VEGA_PLAYER",
      action: "selectAudioTrack",
      index: 1
    });
    const updatedStream = bridge.getCurrentStreamInfo();
    assert.equal(updatedStream[0].index, 1);

    // Test text (subtitle) tracks handling
    bridge._handleNativeEvent({
      name: "texttracks",
      textTracks: [
        { index: 0, label: "English Subs", language: "eng", mode: "disabled" },
        { index: 1, label: "Polish Subs", language: "pol", mode: "showing" }
      ]
    });
    const totalTracksWithSubs = bridge.getTotalTrackInfo();
    assert.equal(totalTracksWithSubs.length, 4);
    assert.equal(totalTracksWithSubs[2].type, "TEXT");
    assert.equal(totalTracksWithSubs[2].name, "English Subs");
    assert.equal(totalTracksWithSubs[3].extra_info.track_lang, "pol");

    const streamWithSubs = bridge.getCurrentStreamInfo();
    assert.equal(streamWithSubs.length, 2);
    assert.equal(streamWithSubs[1].type, "TEXT");
    assert.equal(streamWithSubs[1].index, 1);

    bridge.setSelectTrack("TEXT", 0);
    assert.deepEqual(messages[messages.length - 1], {
      type: "NUVIO_VEGA_PLAYER",
      action: "selectTextTrack",
      index: 0
    });

    bridge.setSilentSubtitle(true);
    assert.deepEqual(messages[messages.length - 1], {
      type: "NUVIO_VEGA_PLAYER",
      action: "setSilentSubtitle",
      silent: true
    });
  } finally {
    globalThis.ReactNativeWebView = previousBridge;
    if (previousPlayer) {
      globalThis.__NUVIO_VEGA_PLAYER__ = previousPlayer;
    } else {
      delete globalThis.__NUVIO_VEGA_PLAYER__;
    }
  }
});

test("vegaAdapter recognizes Fire TV back and navigation keys", () => {
  assert.equal(vegaAdapter.isBackEvent({ key: "Escape", keyCode: 27 }), true);
  assert.equal(vegaAdapter.isBackEvent({ key: "Backspace", keyCode: 8 }), true);
  assert.equal(vegaAdapter.isBackEvent({ keyCode: 461 }), true);
  assert.equal(vegaAdapter.isBackEvent({ keyCode: 166 }), true);

  const normalizedEnter = vegaAdapter.normalizeKey({ key: "Enter", keyCode: 23 });
  assert.equal(normalizedEnter.isEnter, true);
  assert.equal(normalizedEnter.keyCode, 13);

  const normalizedLeft = vegaAdapter.normalizeKey({ key: "ArrowLeft" });
  assert.equal(normalizedLeft.isArrow, true);
  assert.equal(normalizedLeft.keyCode, 37);
});

test("vegaAdapter posts exitApp message to ReactNativeWebView bridge", () => {
  const previousBridge = globalThis.ReactNativeWebView;
  const messages = [];
  globalThis.ReactNativeWebView = {
    postMessage(msg) {
      messages.push(JSON.parse(msg));
    }
  };

  try {
    const result = vegaAdapter.exitApp();
    assert.equal(result, true);
    assert.deepEqual(messages, [{ type: "NUVIO_EXIT_APP" }]);
  } finally {
    globalThis.ReactNativeWebView = previousBridge;
  }
});

test("Platform detects vega when __NUVIO_PLATFORM__ is set", () => {
  const prevPlatform = globalThis.__NUVIO_PLATFORM__;
  const prevCurrent = Platform.current;
  globalThis.__NUVIO_PLATFORM__ = "vega";
  Platform.current = null;

  try {
    assert.equal(Platform.getName(), "vega");
    assert.equal(Platform.isVega(), true);
    assert.equal(Platform.isBrowser(), false);
  } finally {
    globalThis.__NUVIO_PLATFORM__ = prevPlatform;
    Platform.current = prevCurrent;
  }
});

test("vegaAdapter keeps IDLE on loadedmetadata and forwards native error diagnostics via onerrormsg", () => {
  const previousBridge = globalThis.ReactNativeWebView;
  globalThis.ReactNativeWebView = { postMessage() {} };
  try {
    const bridge = createVegaPlayerBridge();
    let prepared = false;
    let errMsgPayload = null;
    let errText = null;
    bridge.setListener({
      onerrormsg(type, payload) {
        errMsgPayload = { type, payload: JSON.parse(payload) };
      },
      onerror(msg) {
        errText = msg;
      }
    });
    bridge.open("https://example.com/test.mkv");
    bridge.prepareAsync(() => {
      prepared = true;
    });
    bridge._handleNativeEvent({ name: "loadedmetadata", duration: 60 });
    assert.equal(prepared, false);
    assert.equal(bridge.getState(), "IDLE");
    assert.equal(bridge.getDuration(), 60000);

    bridge._handleNativeEvent({
      name: "error",
      error: "Vega native player preroll timeout",
      code: 4,
      details: {
        reason: "native-preroll-timeout",
        readyState: 0,
        diagnosticLogs: ["12:00:00.000 [open]", "12:00:15.000 [preroll_timeout]"]
      }
    });
    assert.equal(bridge.getState(), "NONE");
    assert.equal(errMsgPayload?.type, "native-preroll-timeout");
    assert.deepEqual(errMsgPayload?.payload?.diagnosticLogs, [
      "12:00:00.000 [open]",
      "12:00:15.000 [preroll_timeout]"
    ]);
    assert.equal(errText, "Vega native player preroll timeout");
  } finally {
    globalThis.ReactNativeWebView = previousBridge;
  }
});
