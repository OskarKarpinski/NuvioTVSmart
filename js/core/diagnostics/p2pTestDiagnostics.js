// Test build for issue #1388: every P2P startup step is written to the
// in-app Console debug (console.warn) with the time since the stream was chosen.
const SAMPLE_EVERY_MS = 10000;
const SAMPLE_TIMEOUT_MS = 3000;
const MAX_SAMPLES = 16;

let startedAt = 0;
let sampler = null;

function elapsed() {
  return startedAt ? `+${((Date.now() - startedAt) / 1000).toFixed(1)}s` : "+?s";
}

function compact(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

export function p2pDiag(step, data) {
  console.warn(`[P2P test] ${elapsed()} ${step}`, compact(data));
}

export function p2pDiagStart(step, data) {
  stopP2pStatsSampler();
  startedAt = Date.now();
  p2pDiag(step, data);
}

function timedJson(url) {
  const t0 = Date.now();
  return Promise.race([
    fetch(url, { cache: "no-store" }).then((response) => response.json()),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`no answer in ${SAMPLE_TIMEOUT_MS}ms`)), SAMPLE_TIMEOUT_MS)
    )
  ]).then(
    (json) => ({ json, ms: Date.now() - t0 }),
    (error) => ({ error: error?.message || String(error), ms: Date.now() - t0 })
  );
}

function formatRequests(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return "reqs none";
  }
  const now = Date.now();
  const open = entries.filter((entry) => !entry.d).length;
  const items = entries.slice(-4).map((entry) => {
    const path = String(entry.p || "").replace(/\/[0-9a-f]{40}/i, "<hash>");
    const range = String(entry.r || "").replace("bytes=", "") || "-";
    const size = `${Math.round(Number(entry.b || 0) / 1048576)}MB`;
    const age = Math.round((now - Number(entry.t || now)) / 1000);
    return `${path} ${range} ${size} ${age}s ${entry.d ? "done" : "OPEN"}${entry.s ? ` ${entry.s}` : ""}`;
  });
  return `reqs open ${open}/${entries.length} · ${items.join(" · ")}`;
}

export function startP2pStatsSampler(baseUrl, infoHash, fileIdx) {
  stopP2pStatsSampler();
  const statsUrl = `${baseUrl}/${infoHash}/${fileIdx}/stats.json`;
  const state = { count: 0, timer: 0, stopped: false };
  sampler = state;
  const sample = async () => {
    if (state.stopped) return;
    state.count += 1;
    const [stats, service] = await Promise.all([
      timedJson(statsUrl),
      timedJson("http://127.0.0.1:2712/")
    ]);
    if (state.stopped) return;
    const s = stats.json || {};
    const v = service.json || {};
    const torrent = stats.error
      ? `stats.json FAILED (${stats.error})`
      : `stats ${stats.ms}ms · peers ${s.peers} · unchoked ${s.unchoked} · found ${s.unique} · tries ${s.connectionTries} · ` +
        `${Math.round((s.downloadSpeed || 0) / 1024)} KB/s · ${Math.round((s.downloaded || 0) / 1048576)} MB` +
        (typeof s.swarmPaused === "boolean" ? ` · paused ${s.swarmPaused ? 1 : 0}` : "") +
        (Number.isFinite(s.streamProgress) ? ` · file ${Math.round(s.streamProgress * 100)}%` : "");
    const node = service.error
      ? `diag FAILED (${service.error})`
      : `node ${v.node} · blocked max ${v.maxLagMs}ms · ${v.rssMb} MB`;
    p2pDiag(
      `sample #${state.count}`,
      `${torrent} | ${node} | ${service.error ? "reqs ?" : formatRequests(v.requests)}`
    );
    if (state.count < MAX_SAMPLES && !state.stopped) {
      state.timer = setTimeout(sample, SAMPLE_EVERY_MS);
    }
  };
  state.timer = setTimeout(sample, 1000);
}

export function stopP2pStatsSampler(reason = "") {
  if (!sampler) return;
  sampler.stopped = true;
  clearTimeout(sampler.timer);
  sampler = null;
  if (reason) p2pDiag(`stats stopped: ${reason}`);
}

console.warn("[P2P test] diagnostics build for issue #1388 loaded");
