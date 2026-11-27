import { saveReusableStreamLink } from "../../../core/streams/streamLinkReuse.js";
import { getConsoleDebugEvents } from "../../../core/diagnostics/consoleDebugBuffer.js";
/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods18() {
  const {
    PlayerController,
    isExpiredStreamUrl,
    LOADING_LOGO_FILL_TARGET_LERP,
    LOADING_LOGO_FILL_IDLE_STEP,
    LOADING_LOGO_FILL_FRAME_MS,
    t,
    clamp,
    escapeHtml
  } = internals;

  return {
    startPlayerControllerPlayback(url, context = {}, { mountToken = null, sourceCandidate = null } = {}) {
      const playbackUrl = String(url || "").trim();
      if (!playbackUrl) {
        this.showStartupError(t("player_error_no_stream_url", {}, "No stream URL provided"), {
          streamCandidate: sourceCandidate,
          reason: "missing-url"
        });
        return;
      }
      if (isExpiredStreamUrl(playbackUrl)) {
        this.showExpiredStreamError(playbackUrl, {
          sourceCandidate,
          reason: "stream-url-expired-before-start"
        });
        return Promise.resolve();
      }
      // Keep the candidate as a defensive source of truth. A route can be
      // rebuilt with a context that no longer contains requestHeaders, while
      // the plugin metadata is still present on the selected stream.
      const candidateHeaders = this.getCurrentStreamRequestHeaders(sourceCandidate);
      const contextHeaders = context?.requestHeaders && typeof context.requestHeaders === "object" ? context.requestHeaders : {};
      const requestHeaders = { ...candidateHeaders, ...contextHeaders };
      const playbackContext = {
        ...(context && typeof context === "object" ? context : {}),
        ...(Object.keys(requestHeaders).length ? { requestHeaders } : {})
      };
      saveReusableStreamLink(this, sourceCandidate || this.getCurrentStreamCandidate(), { url: playbackUrl, headers: requestHeaders });
      PlayerController.setStartupPresentationAudioMuted?.(true);
      return Promise.resolve(PlayerController.play(playbackUrl, playbackContext)).catch((error) => {
        if (!this.isActiveMountToken(mountToken) || this.isExternalFrameMode()) {
          return;
        }
        if (playbackUrl !== String(this.activePlaybackUrl || "").trim()) {
          return;
        }
        if (this.isStartupErrorVisible()) {
          return;
        }
        const mediaErrorCode =
          typeof PlayerController.getLastPlaybackErrorCode === "function" ? Number(PlayerController.getLastPlaybackErrorCode() || 0) : 0;
        const detail = String(error?.message || error?.name || error || "").trim();
        const candidate = sourceCandidate || this.getStreamCandidateByUrl(playbackUrl) || this.getCurrentStreamCandidate();
        if (this.tryServerPlaybackFallback?.(candidate)) return;
        this.markPlaybackSourceFailed(playbackUrl);
        if (!this.hasPresentedPlaybackFrame) {
          this.showStartupError(this.getStartupErrorMessage(mediaErrorCode, detail, candidate), {
            mediaErrorCode,
            detail,
            error,
            streamCandidate: candidate,
            playbackUrl,
            reason: "play-start"
          });
          console.warn("Playback failed to start", {
            url: playbackUrl,
            mediaErrorCode,
            error
          });
          return;
        }
        this.sourcesError = this.formatPlaybackErrorForSources(
          `${this.mediaErrorMessage(mediaErrorCode, detail, candidate)}. Choose another source manually.`,
          {
            mediaErrorCode,
            detail,
            error,
            streamCandidate: candidate,
            playbackUrl,
            reason: "play-after-startup"
          }
        );
        this.renderSourcesPanel();
        console.warn("Playback failed after startup", {
          url: playbackUrl,
          mediaErrorCode,
          error
        });
      });
    },
    getStartupErrorMessage(mediaErrorCode = 0, detail = "", streamCandidate = this.getCurrentStreamCandidate()) {
      const code = Number(mediaErrorCode || 0);
      const compatibilityMessage = this.getWebHeaderRestrictedStreamMessage(streamCandidate);
      if (compatibilityMessage && (code === 0 || code === 2 || code === 4) && !this.resolvePlaybackHttpStatus(detail)) {
        return compatibilityMessage;
      }
      const baseMessage = this.mediaErrorMessage(code, detail, streamCandidate);
      const extra = String(detail || "").trim();
      if (!extra) {
        return `${baseMessage}.`;
      }
      const normalizedExtra = extra.replace(/\s+/g, " ");
      if (baseMessage.toLowerCase().includes(normalizedExtra.toLowerCase())) {
        return baseMessage;
      }
      return `${baseMessage}. ${normalizedExtra}`;
    },
    focusStartupErrorButton(preferredAction = "retry") {
      const overlay = this.uiRefs?.startupErrorOverlay;
      if (!overlay) return;
      const buttons = Array.from(overlay.querySelectorAll(".player-startup-error-button"));
      if (!buttons.length) return;
      let target = buttons.find((btn) => btn.dataset.playerErrorAction === preferredAction);
      if (!target) {
        target = buttons.find((btn) => btn.dataset.playerErrorAction === "sources") || buttons[0];
      }
      buttons.forEach((btn) => btn.classList.toggle("focused", btn === target));
      try {
        target?.focus?.({ preventScroll: true });
      } catch (_) {
        target?.focus?.();
      }
    },
    moveStartupErrorFocus(delta = 1) {
      const overlay = this.uiRefs?.startupErrorOverlay;
      if (!overlay) return;
      const buttons = Array.from(overlay.querySelectorAll(".player-startup-error-button"));
      if (buttons.length <= 1) return;
      const currentIndex = buttons.findIndex((btn) => btn.classList.contains("focused") || document.activeElement === btn);
      const nextIndex = clamp(currentIndex + delta, 0, buttons.length - 1);
      const target = buttons[nextIndex];
      buttons.forEach((btn) => btn.classList.toggle("focused", btn === target));
      try {
        target?.focus?.({ preventScroll: true });
      } catch (_) {
        target?.focus?.();
      }
    },
    async retryPlaybackAfterError() {
      const candidate = this.getCurrentStreamCandidate() || this.initialStreamCandidate;
      if (this.currentTime > 0 && !this.pendingPlaybackRestore) {
        this.pendingPlaybackRestore = {
          timeSeconds: this.currentTime,
          paused: false,
          attempts: 0,
          lastAttemptAt: 0
        };
      }
      this.clearStartupError();
      if (candidate) {
        await this.playStreamCandidate(candidate, { preservePlaybackState: true });
      } else if (this.activePlaybackUrl) {
        await this.startPlayerControllerPlayback(this.activePlaybackUrl, {}, { mountToken: this.playerMountToken });
      } else {
        this.navigateBackToStreamScreen();
      }
    },
    chooseSourceAfterError() {
      this.clearStartupError();
      this.openSourcesPanel();
    },
    getStartupErrorLogLines() {
      const lines = [];
      const push = (value) => {
        const text = String(value ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 420);
        if (text) {
          lines.push(text);
        }
      };
      const eventDetail = this.startupErrorEventDetail || {};
      const avplayDiagnostic = eventDetail.avplayErrorDetail || {};
      const nativeLogs = Array.isArray(eventDetail.diagnosticLogs)
        ? eventDetail.diagnosticLogs
        : Array.isArray(avplayDiagnostic.diagnosticLogs)
          ? avplayDiagnostic.diagnosticLogs
          : [];

      push(`Nuvio Vega diagnostics - ${new Date().toISOString()}`);
      push(`Message: ${this.startupErrorMessage}`);
      push(`Reason: ${this.startupErrorReason || avplayDiagnostic.reason || eventDetail.nativeReason || "unknown"}`);
      push(`Media code: ${this.getPlaybackErrorCodeLabel(this.startupErrorMediaCode)}`);
      push("Details:");
      (Array.isArray(this.startupErrorDetails) ? this.startupErrorDetails : [])
        .filter((line) => !String(line || "").startsWith("Native logs"))
        .forEach(push);
      if (nativeLogs.length) {
        push(`Native player log (${nativeLogs.length} entries):`);
        nativeLogs.forEach(push);
      }
      try {
        const consoleEvents = getConsoleDebugEvents().slice(-60);
        if (consoleEvents.length) {
          push(`Console buffer (${consoleEvents.length} entries):`);
          consoleEvents.forEach((entry) => push(`${entry.isoTime} [${entry.level}] ${entry.message}`));
        }
      } catch (_) {
        push("Console buffer unavailable");
      }
      return lines;
    },
    toggleStartupErrorLogs() {
      this.startupErrorLogsVisible = !this.startupErrorLogsVisible;
      this.startupErrorLogScroll = 0;
      this.renderStartupErrorOverlay();
      const panel = this.uiRefs?.startupErrorLogsPanel;
      try {
        panel?.focus?.({ preventScroll: true });
      } catch (_) {
        panel?.focus?.();
      }
    },
    scrollStartupErrorLogs(delta) {
      if (!this.startupErrorLogsVisible) {
        return;
      }
      const total = this.getStartupErrorLogLines().length;
      const maxScroll = Math.max(0, total - 6);
      this.startupErrorLogScroll = clamp(this.startupErrorLogScroll + delta * 6, 0, maxScroll);
      this.renderStartupErrorOverlay();
      try {
        this.uiRefs?.startupErrorLogsPanel?.focus?.({ preventScroll: true });
      } catch (_) {
        this.uiRefs?.startupErrorLogsPanel?.focus?.();
      }
    },
    renderStartupErrorOverlay() {
      const overlay = this.uiRefs?.startupErrorOverlay;
      if (!overlay) {
        return;
      }
      const visible = this.isStartupErrorVisible();
      overlay.classList.toggle("hidden", !visible);
      overlay.setAttribute("aria-hidden", visible ? "false" : "true");
      if (!visible) {
        overlay.innerHTML = "";
        return;
      }
      const message = String(this.startupErrorMessage || "").trim() || t("player_error_playback_fallback", {}, "Playback error");
      const detailLines = Array.isArray(this.startupErrorDetails) ? this.startupErrorDetails.filter(Boolean) : [];
      const hasCandidates = Array.isArray(this.streamCandidates) && this.streamCandidates.length > 0;
      overlay.innerHTML = `
          <div class="player-startup-error-shell">
            <div class="player-startup-error-title">${escapeHtml(t("player_error_title", {}, "Playback Error"))}</div>
            <div class="player-startup-error-message" role="status" aria-live="polite">${escapeHtml(message)}</div>
            ${
              detailLines.length
                ? `
              <div class="player-startup-error-details" aria-label="${escapeHtml(t("player_error_details", {}, "Playback error details"))}">
                ${detailLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
              </div>
            `
                : ""
            }
            ${
              this.startupErrorLogsVisible
                ? (() => {
                    const logLines = this.getStartupErrorLogLines();
                    const from = this.startupErrorLogScroll || 0;
                    const visibleLines = logLines.slice(from, from + 6);
                    return `
              <div class="player-startup-error-logs" data-player-error-logs tabindex="-1" aria-label="Nuvio diagnostic logs">
                <div class="player-startup-error-logs-title">
                  ${escapeHtml(t("player_error_dump_logs", {}, "Zrzut logów"))} (${from + 1}-${Math.min(from + 6, logLines.length)}/${logLines.length})
                </div>
                ${visibleLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
                <div class="player-startup-error-logs-hint">↑/↓ — przewijanie</div>
              </div>
            `;
                  })()
                : ""
            }
            <div class="player-startup-error-actions">
              <button class="player-startup-error-button focusable is-primary" type="button" tabindex="-1" data-player-error-action="retry">
                ${escapeHtml(t("retry", {}, "Spróbuj ponownie"))}
              </button>
              ${
                hasCandidates
                  ? `
                <button class="player-startup-error-button focusable" type="button" tabindex="-1" data-player-error-action="sources">
                  ${escapeHtml(t("sources_title", {}, "Wybierz inne źródło"))}
                </button>
              `
                  : ""
              }
              <button class="player-startup-error-button focusable" type="button" tabindex="-1" data-player-error-action="dumpLogs">
                ${escapeHtml(this.startupErrorLogsVisible ? t("player_error_hide_logs", {}, "Ukryj logi") : t("player_error_dump_logs", {}, "Zrzut logów"))}
              </button>
              <button class="player-startup-error-button focusable" type="button" tabindex="-1" data-player-error-action="back">
                ${escapeHtml(t("player_go_back", {}, "Wróć"))}
              </button>
            </div>
          </div>
        `;
      this.uiRefs = {
        ...(this.uiRefs || {}),
        startupErrorButton:
          overlay.querySelector('.player-startup-error-button[data-player-error-action="retry"]') ||
          overlay.querySelector(".player-startup-error-button"),
        startupErrorLogsPanel: overlay.querySelector("[data-player-error-logs]")
      };
      this.focusStartupErrorButton("retry");
    },
    shouldUseLoadingLogoFill() {
      return Boolean(this.currentEngineFsStream && !this.isExternalFrameMode());
    },
    stopLoadingLogoFillAnimation() {
      if (this.loadingLogoFillFrame != null) {
        clearTimeout(this.loadingLogoFillFrame);
        this.loadingLogoFillFrame = null;
      }
    },
    scheduleLoadingLogoFillAnimation() {
      if (this.loadingLogoFillFrame != null || !this.loadingLogoFillActive) {
        return;
      }
      this.loadingLogoFillFrame = setTimeout(() => {
        this.loadingLogoFillFrame = null;
        if (!this.loadingLogoFillActive) {
          return;
        }
        const current = clamp(Number(this.loadingLogoFillProgress || 0), 0, 1);
        const target = clamp(Number(this.loadingLogoFillTarget ?? current), current, 1);
        if (current >= 1 || target <= current) {
          this.syncLoadingOverlayProgress();
          return;
        }
        const distance = target - current;
        const step = Math.max(LOADING_LOGO_FILL_IDLE_STEP, distance * LOADING_LOGO_FILL_TARGET_LERP);
        this.loadingLogoFillProgress = Math.min(target, current + step);
        this.syncLoadingOverlayProgress();
        if (this.loadingLogoFillProgress < target) {
          this.scheduleLoadingLogoFillAnimation();
        }
      }, LOADING_LOGO_FILL_FRAME_MS);
    },
    setLoadingLogoFillTarget(progress = null, { immediate = false } = {}) {
      if (!this.shouldUseLoadingLogoFill()) {
        this.loadingLogoFillActive = false;
        this.loadingLogoFillProgress = 0;
        this.loadingLogoFillTarget = 0;
        this.stopLoadingLogoFillAnimation();
        this.syncLoadingOverlayProgress();
        return;
      }
      const parsed = Number(progress);
      if (!Number.isFinite(parsed)) {
        return;
      }
      const current = clamp(Number(this.loadingLogoFillProgress || 0), 0, 1);
      const target = clamp(parsed, current, 1);
      this.loadingLogoFillActive = true;
      this.loadingLogoFillTarget = Math.max(Number(this.loadingLogoFillTarget || 0), target);
      if (immediate) {
        this.loadingLogoFillProgress = Math.max(current, target);
      }
      this.syncLoadingOverlayProgress();
      this.scheduleLoadingLogoFillAnimation();
    },
    syncLoadingOverlayProgress() {
      const identity = this.uiRefs?.loadingIdentity;
      const stack = this.uiRefs?.loadingLogoStack;
      const base = this.uiRefs?.loadingLogoBase;
      const fillClip = this.uiRefs?.loadingLogoFillClip;
      if (this.isStartupErrorVisible()) {
        if (identity) {
          identity.classList.remove("is-loading-progress");
        }
        if (stack) {
          stack.classList.remove("is-loading-progress");
        }
        if (base) {
          base.style.opacity = "";
        }
        if (fillClip) {
          fillClip.classList.add("hidden");
          fillClip.style.width = "0%";
        }
        return;
      }
      if (!this.shouldUseLoadingLogoFill()) {
        this.loadingLogoFillActive = false;
        this.loadingLogoFillProgress = 0;
        this.loadingLogoFillTarget = 0;
        this.stopLoadingLogoFillAnimation();
        if (identity) {
          identity.classList.remove("is-loading-progress");
        }
        if (stack) {
          stack.classList.remove("is-loading-progress");
        }
        if (base) {
          base.style.opacity = "";
        }
        if (fillClip) {
          fillClip.classList.add("hidden");
          fillClip.style.width = "0%";
        }
        return;
      }
      const progress = Number(this.loadingProgress);
      const hasProgress = Number.isFinite(progress) && progress > 0;
      if (hasProgress) {
        this.loadingLogoFillActive = true;
        this.loadingLogoFillTarget = Math.max(Number(this.loadingLogoFillTarget || 0), clamp(progress, 0, 1));
      }
      if (this.currentEngineFsStream && this.hasPresentedPlaybackFrame && !this.isExternalFrameMode()) {
        this.loadingLogoFillActive = true;
        this.loadingLogoFillTarget = 1;
      }
      const showFill = Boolean(this.loadingLogoFillActive);
      if (identity) {
        identity.classList.toggle("is-loading-progress", showFill);
      }
      if (stack) {
        stack.classList.toggle("is-loading-progress", showFill);
      }
      if (base) {
        base.style.opacity = showFill ? "0.25" : "";
      }
      if (fillClip) {
        fillClip.classList.toggle("hidden", !showFill);
        if (showFill) {
          const visiblePercent = Math.round(clamp(this.loadingLogoFillProgress || 0, 0, 1) * 10000) / 100;
          fillClip.style.width = `${visiblePercent}%`;
        } else {
          fillClip.style.width = "0%";
        }
      }
      if (showFill && clamp(Number(this.loadingLogoFillProgress || 0), 0, 1) < clamp(Number(this.loadingLogoFillTarget || 0), 0, 1)) {
        this.scheduleLoadingLogoFillAnimation();
      }
    }
  };
}
