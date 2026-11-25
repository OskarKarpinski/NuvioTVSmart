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

export function createVegaPlayerBridge() {
  let state = "NONE";
  let currentListener = null;
  let currentTimeMs = 0;
  let durationMs = 0;
  let pendingPrepare = null;
  let pendingSeek = null;

  function post(action, data = {}) {
    postToVegaHost({ type: "NUVIO_VEGA_PLAYER", action, ...data });
  }

  return {
    open(url) {
      state = "IDLE";
      currentTimeMs = 0;
      durationMs = 0;
      pendingPrepare = null;
      pendingSeek = null;
      globalThis.document?.body?.classList?.add("vega-native-player-active");
      post("open", { url });
    },

    setListener(listener) {
      currentListener = listener || null;
    },

    prepareAsync(onSuccess, onError) {
      if (state === "READY") {
        setTimeout(() => {
          onSuccess?.();
          currentListener?.onbufferingcomplete?.();
        }, 0);
        return;
      }
      pendingPrepare = { onSuccess, onError };
      post("prepare");
    },

    play() {
      state = "PLAYING";
      post("play");
    },

    pause() {
      state = "PAUSED";
      post("pause");
    },

    seekTo(ms, onSuccess, onError) {
      pendingSeek = { ms, onSuccess, onError };
      post("seek", { positionMs: Math.max(0, Number(ms || 0)) });
    },

    stop() {
      state = "IDLE";
      post("stop");
    },

    close() {
      state = "NONE";
      globalThis.document?.body?.classList?.remove("vega-native-player-active");
      post("close");
    },

    getState() {
      return state;
    },

    getCurrentTime() {
      return currentTimeMs;
    },

    getDuration() {
      return durationMs;
    },

    setDisplayRect() {},
    setDisplayMethod() {},
    setStreamingProperty() {},
    setBufferingParam() {},
    setTimeoutForBuffering() {},
    setSelectTrack() {},
    setSilentSubtitle() {},
    setSpeed(speed) {
      post("rate", { rate: Number(speed || 1) });
    },
    getTotalTrackInfo() {
      return [];
    },
    getCurrentStreamInfo() {
      return [];
    },

    _handleNativeEvent(event) {
      if (!event) return;
      const name = String(event.name || "");
      if (Number.isFinite(event.duration) && event.duration > 0) {
        durationMs = Math.round(event.duration * 1000);
      }
      if (Number.isFinite(event.currentTime) && event.currentTime >= 0) {
        currentTimeMs = Math.round(event.currentTime * 1000);
      }

      switch (name) {
        case "canplay":
        case "loadedmetadata":
        case "loadeddata":
          if (state === "IDLE") {
            state = "READY";
          }
          if (pendingPrepare) {
            const cb = pendingPrepare;
            pendingPrepare = null;
            cb.onSuccess?.();
          }
          currentListener?.onbufferingcomplete?.();
          break;

        case "timeupdate":
          currentListener?.oncurrentplaytime?.(currentTimeMs);
          break;

        case "playing":
          state = "PLAYING";
          currentListener?.onbufferingcomplete?.();
          break;

        case "pause":
          state = "PAUSED";
          break;

        case "waiting":
        case "stalled":
          currentListener?.onbufferingstart?.();
          break;

        case "progress":
          currentListener?.onbufferingprogress?.(event.percent ?? 50);
          break;

        case "seeked":
          if (pendingSeek) {
            const cb = pendingSeek;
            pendingSeek = null;
            cb.onSuccess?.();
          }
          break;

        case "ended":
          state = "IDLE";
          currentListener?.onstreamcompleted?.();
          break;

        case "error": {
          state = "NONE";
          const errText =
            typeof event.error === "string" && event.error
              ? event.error
              : typeof event.error?.message === "string"
                ? event.error.message
                : "Native playback error";
          if (pendingPrepare) {
            const cb = pendingPrepare;
            pendingPrepare = null;
            cb.onError?.(errText);
          }
          currentListener?.onerror?.(errText);
          break;
        }
      }
    }
  };
}

export const vegaAdapter = {
  name: "vega",

  init() {
    if (!globalThis.__NUVIO_VEGA_PLAYER__) {
      globalThis.__NUVIO_VEGA_PLAYER__ = createVegaPlayerBridge();
    }
  },

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
      tizenAvplay: false,
      vegaAvplay: true
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
