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
  let seekingTargetMs = null;
  let seekFallbackTimer = null;
  let nativeAudioTracks = [];
  let nativeTextTracks = [];
  let selectedAudioTrackIndex = -1;
  let streamingProperties = {};

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
      seekingTargetMs = null;
      nativeAudioTracks = [];
      nativeTextTracks = [];
      selectedAudioTrackIndex = -1;
      if (seekFallbackTimer) {
        clearTimeout(seekFallbackTimer);
        seekFallbackTimer = null;
      }
      globalThis.document?.documentElement?.classList?.add("vega-native-player-active");
      globalThis.document?.body?.classList?.add("vega-native-player-active");
      post("open", { url, headers: { ...streamingProperties } });
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
      post("prepare", { headers: { ...streamingProperties } });
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
      if (seekFallbackTimer) {
        clearTimeout(seekFallbackTimer);
        seekFallbackTimer = null;
      }
      const targetMs = Math.max(0, Number(ms || 0));
      currentTimeMs = targetMs;
      seekingTargetMs = targetMs;
      pendingSeek = { ms: targetMs, onSuccess, onError };
      post("seek", { positionMs: targetMs });

      // A seek rebuilds a local file from the already-downloaded master. Give
      // that work time to finish; the native 'seeked' event normally wins.
      seekFallbackTimer = setTimeout(() => {
        seekFallbackTimer = null;
        seekingTargetMs = null;
        if (pendingSeek) {
          const cb = pendingSeek;
          pendingSeek = null;
          cb.onSuccess?.();
        }
      }, 8000);
    },

    stop() {
      state = "IDLE";
      post("stop");
    },

    close() {
      state = "NONE";
      if (seekFallbackTimer) {
        clearTimeout(seekFallbackTimer);
        seekFallbackTimer = null;
      }
      seekingTargetMs = null;
      pendingSeek = null;
      nativeAudioTracks = [];
      nativeTextTracks = [];
      selectedAudioTrackIndex = -1;
      streamingProperties = {};
      globalThis.document?.documentElement?.classList?.remove("vega-native-player-active");
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
    setStreamingProperty(prop, value) {
      if (prop && value != null) {
        const key = String(prop).trim();
        streamingProperties[key] = String(value);
        if (key.toUpperCase() === "COOKIE") {
          streamingProperties["Cookie"] = String(value);
        } else if (key.toUpperCase() === "USER_AGENT") {
          streamingProperties["User-Agent"] = String(value);
        }
        post("setHeaders", { headers: { ...streamingProperties } });
      }
    },
    setRequestHeaders(headers) {
      if (headers && typeof headers === "object") {
        Object.assign(streamingProperties, headers);
        post("setHeaders", { headers: { ...streamingProperties } });
      }
    },
    setBufferingParam() {},
    setTimeoutForBuffering() {},
    setSelectTrack(type, index) {
      const normalizedType = String(type).toUpperCase();
      if (normalizedType === "AUDIO") {
        const trackIdx = Number(index);
        if (Number.isFinite(trackIdx) && trackIdx >= 0) {
          selectedAudioTrackIndex = trackIdx;
        }
        nativeAudioTracks.forEach((t, i) => {
          t.enabled = i === trackIdx;
        });
        // The host remuxer marks this stream as the Matroska default track;
        // the native enable flags are only a best-effort mirror.
        post("selectAudioTrack", {
          index: trackIdx,
          trackCount: nativeAudioTracks.length
        });
      } else if (normalizedType === "TEXT") {
        const trackIdx = Number(index);
        nativeTextTracks.forEach((t, i) => {
          t.mode = i === trackIdx ? "showing" : "disabled";
        });
        post("selectTextTrack", { index: trackIdx });
      }
    },
    setSilentSubtitle(silent) {
      const isSilent = Boolean(silent);
      if (isSilent) {
        nativeTextTracks.forEach((t) => {
          t.mode = "disabled";
        });
      }
      post("setSilentSubtitle", { silent: isSilent });
    },
    setSpeed(speed) {
      post("rate", { rate: Number(speed || 1) });
    },
    getTotalTrackInfo() {
      const audio = nativeAudioTracks.map((t, idx) => ({
        type: "AUDIO",
        index: idx,
        name: t.title || t.label || t.language || `Track ${idx + 1}`,
        extra_info: {
          track_lang: t.language || "und",
          title: t.title || "",
          fourCC: "opus",
          codec: "opus",
          channels: t.sourceChannels || "2",
          sampleRate: t.sampleRate || 48000,
          source_codec: t.sourceCodec || "",
          source_channels: t.sourceChannels || ""
        }
      }));
      const text = nativeTextTracks.map((t, idx) => ({
        type: "TEXT",
        index: idx,
        name: t.label || t.language || `Subtitle ${idx + 1}`,
        extra_info: {
          track_lang: t.language || "und",
          fourCC: "subt"
        }
      }));
      return [...audio, ...text];
    },
    getCurrentStreamInfo() {
      const current = [];
      const preferredAudio =
        selectedAudioTrackIndex >= 0 && selectedAudioTrackIndex < nativeAudioTracks.length
          ? nativeAudioTracks[selectedAudioTrackIndex]
          : null;
      const activeAudio =
        preferredAudio || nativeAudioTracks.find((t) => t.enabled) || nativeAudioTracks[0];
      if (activeAudio) {
        const idx = nativeAudioTracks.indexOf(activeAudio);
        current.push({
          type: "AUDIO",
          index: idx >= 0 ? idx : 0,
          name:
            activeAudio.title || activeAudio.label || activeAudio.language || `Track ${idx + 1}`,
          extra_info: {
            track_lang: activeAudio.language || "und",
            title: activeAudio.title || "",
            fourCC: "opus",
            codec: "opus",
            channels: activeAudio.sourceChannels || "2",
            sampleRate: activeAudio.sampleRate || 48000,
            source_codec: activeAudio.sourceCodec || "",
            source_channels: activeAudio.sourceChannels || ""
          }
        });
      }
      const activeText = nativeTextTracks.find((t) => t.mode === "showing");
      if (activeText) {
        const idx = nativeTextTracks.indexOf(activeText);
        current.push({
          type: "TEXT",
          index: idx >= 0 ? idx : 0,
          extra_info: {
            track_lang: activeText.language || "und",
            fourCC: "subt"
          }
        });
      }
      return current;
    },

    _handleNativeEvent(event) {
      if (!event) return;
      const name = String(event.name || "");
      if (Number.isFinite(event.duration) && event.duration > 0) {
        durationMs = Math.round(event.duration * 1000);
      }
      const incomingCurrentTimeMs =
        Number.isFinite(event.currentTime) && event.currentTime >= 0
          ? Math.round(event.currentTime * 1000)
          : null;

      if (incomingCurrentTimeMs != null) {
        if (seekingTargetMs != null) {
          // While seeking is in flight, reject stale timeupdates that belong to the pre-seek position.
          if (name === "timeupdate" && Math.abs(incomingCurrentTimeMs - seekingTargetMs) > 2500) {
            return;
          }
          if (name === "seeked" || Math.abs(incomingCurrentTimeMs - seekingTargetMs) <= 2500) {
            currentTimeMs = incomingCurrentTimeMs;
            seekingTargetMs = null;
          }
        } else {
          currentTimeMs = incomingCurrentTimeMs;
        }
      }

      if (Array.isArray(event.audioTracks)) {
        nativeAudioTracks = event.audioTracks;
      }
      if (Array.isArray(event.textTracks)) {
        nativeTextTracks = event.textTracks;
      }

      switch (name) {
        case "audiotracks":
          if (Array.isArray(event.audioTracks)) {
            nativeAudioTracks = event.audioTracks;
          }
          break;

        case "texttracks":
          if (Array.isArray(event.textTracks)) {
            nativeTextTracks = event.textTracks;
          }
          break;

        case "loadedmetadata":
          if (Array.isArray(event.audioTracks)) {
            nativeAudioTracks = event.audioTracks;
          }
          if (Array.isArray(event.textTracks)) {
            nativeTextTracks = event.textTracks;
          }
          break;

        case "canplay":
        case "loadeddata":
          if (Array.isArray(event.audioTracks)) {
            nativeAudioTracks = event.audioTracks;
          }
          if (Array.isArray(event.textTracks)) {
            nativeTextTracks = event.textTracks;
          }
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
          if (seekFallbackTimer) {
            clearTimeout(seekFallbackTimer);
            seekFallbackTimer = null;
          }
          seekingTargetMs = null;
          if (pendingSeek) {
            const cb = pendingSeek;
            pendingSeek = null;
            cb.onSuccess?.();
          }
          currentListener?.oncurrentplaytime?.(currentTimeMs);
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
          const detailsPayload =
            event.details && typeof event.details === "object"
              ? {
                  ...event.details,
                  reason: event.details.reason || event.reason || "VEGA_NATIVE_ERROR",
                  message: event.details.message || errText,
                  code: event.code ?? event.details.code
                }
              : {
                  reason: event.reason || "VEGA_NATIVE_ERROR",
                  message: errText,
                  code: event.code
                };
          try {
            currentListener?.onerrormsg?.(
              detailsPayload.reason || "VEGA_NATIVE_ERROR",
              JSON.stringify(detailsPayload)
            );
          } catch (_) {
            // Best effort diagnostic forwarding.
          }
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
    globalThis.document?.documentElement?.classList?.add("vega-tv");
    globalThis.document?.body?.classList?.add("vega-tv");
    if (!globalThis.__NUVIO_VEGA_PLAYER__) {
      globalThis.__NUVIO_VEGA_PLAYER__ = createVegaPlayerBridge();
    }
    try {
      globalThis.__NUVIO_VEGA_DRAIN_EVENTS__?.();
    } catch (_) {
      // Events will be delivered by the native onLoad drain instead.
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
