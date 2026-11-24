import { isBackEvent, normalizeKeyEvent } from "../sharedKeys.js";

const VEGA_BACK_CODES = [461, 10009, 27, 8, 166];

function postToVegaHost(payload) {
  try {
    const bridge = globalThis.ReactNativeWebView;
    if (bridge && typeof bridge.postMessage === "function") {
      bridge.postMessage(JSON.stringify(payload));
      return true;
    }
  } catch (_) {
    // Ignore bridge errors when running outside Vega WebView.
  }
  return false;
}

export const vegaAdapter = {
  name: "vega",

  init() {},

  exitApp() {
    if (postToVegaHost({ type: "NUVIO_EXIT_APP" })) {
      return true;
    }
    try {
      globalThis.close?.();
    } catch (_) {
      // Ignore window.close restrictions.
    }
    return false;
  },

  isBackEvent(event) {
    return isBackEvent(event, VEGA_BACK_CODES);
  },

  normalizeKey(event) {
    return normalizeKeyEvent(event, VEGA_BACK_CODES);
  },

  getDeviceLabel() {
    return "Amazon Fire TV (Vega OS)";
  },

  getCapabilities() {
    return {
      hlsJs: Boolean(globalThis.Hls?.isSupported?.()),
      dashJs: Boolean(globalThis.dashjs?.MediaPlayer),
      nativeVideo: true,
      webosAvplay: false,
      tizenAvplay: false
    };
  },

  prepareVideoElement(videoElement) {
    if (!videoElement) {
      return;
    }
    videoElement.playsInline = true;
    if (videoElement.__nuvioVegaBound) {
      return;
    }
    videoElement.__nuvioVegaBound = true;

    let wakeLockSentinel = null;
    const setWakeLock = async (active) => {
      postToVegaHost({ type: "NUVIO_WAKE_LOCK", active: Boolean(active) });
      try {
        if (active && !wakeLockSentinel && globalThis.navigator?.wakeLock?.request) {
          wakeLockSentinel = await globalThis.navigator.wakeLock.request("screen");
        } else if (!active && wakeLockSentinel) {
          await wakeLockSentinel.release();
          wakeLockSentinel = null;
        }
      } catch (_) {
        // Ignore WakeLock errors on unsupported contexts.
      }
    };

    videoElement.addEventListener("play", () => {
      void setWakeLock(true);
    });
    videoElement.addEventListener("pause", () => {
      void setWakeLock(false);
    });
    videoElement.addEventListener("ended", () => {
      void setWakeLock(false);
    });
  }
};
