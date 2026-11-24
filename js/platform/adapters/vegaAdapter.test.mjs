import test from "node:test";
import assert from "node:assert/strict";
import { vegaAdapter } from "./vegaAdapter.js";
import { Platform } from "../index.js";

test("vegaAdapter reports Vega OS metadata and capabilities", () => {
  assert.equal(vegaAdapter.name, "vega");
  assert.equal(vegaAdapter.getDeviceLabel(), "Amazon Fire TV (Vega OS)");

  const caps = vegaAdapter.getCapabilities();
  assert.equal(caps.nativeVideo, true);
  assert.equal(caps.webosAvplay, false);
  assert.equal(caps.tizenAvplay, false);
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
