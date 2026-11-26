/* eslint-disable no-unused-vars */

/**
 * Analizuje tekst nazwy/tytułu wydania oraz URL w celu wykrycia formatu i kodeków.
 */
export function analyzeStreamCodecs(text = "", url = "") {
  const combined = `${text} ${url}`.toUpperCase();
  const info = {
    audio: [],
    video: [],
    hdr: [],
    resolution: "",
    container: "",
    sourceQuality: ""
  };

  // Rozdzielczość
  if (combined.includes("2160P") || combined.includes("4K") || combined.includes("UHD")) {
    info.resolution = "4K UHD (2160p)";
  } else if (combined.includes("1080P") || combined.includes("FHD")) {
    info.resolution = "1080p FHD";
  } else if (combined.includes("720P") || combined.includes("HD")) {
    info.resolution = "720p HD";
  } else if (combined.includes("480P") || combined.includes("SD")) {
    info.resolution = "480p SD";
  }

  // Jakość wydania
  if (combined.includes("REMUX")) {
    info.sourceQuality = "Remux (bezstratny)";
  } else if (
    combined.includes("BLURAY") ||
    combined.includes("BLU-RAY") ||
    combined.includes("BDRIP")
  ) {
    info.sourceQuality = "BluRay";
  } else if (combined.includes("WEB-DL") || combined.includes("WEBDL")) {
    info.sourceQuality = "WEB-DL";
  } else if (combined.includes("WEBRIP") || combined.includes("WEB-RIP")) {
    info.sourceQuality = "WebRip";
  } else if (combined.includes("HDTV")) {
    info.sourceQuality = "HDTV";
  }

  // Kodeki Audio
  if (
    combined.includes("DTS-HD") ||
    combined.includes("DTS HD") ||
    combined.includes("DTS-X") ||
    combined.includes("DTSX")
  ) {
    info.audio.push("DTS-HD MA");
  } else if (combined.includes("DTS")) {
    info.audio.push("DTS");
  }
  if (combined.includes("TRUEHD") || combined.includes("TRUE-HD")) {
    info.audio.push("Dolby TrueHD");
  }
  if (combined.includes("ATMOS")) {
    info.audio.push("Dolby Atmos");
  }
  if (
    combined.includes("EAC3") ||
    combined.includes("E-AC-3") ||
    combined.includes("E-AC3") ||
    combined.includes("DDP")
  ) {
    info.audio.push("E-AC3 (Dolby Digital Plus)");
  } else if (
    combined.includes("AC3") ||
    combined.includes("AC-3") ||
    combined.includes("DD5.1") ||
    combined.includes("DD 5.1")
  ) {
    info.audio.push("AC3 (Dolby Digital)");
  }
  if (combined.includes("AAC")) {
    info.audio.push("AAC");
  }
  if (combined.includes("FLAC")) {
    info.audio.push("FLAC");
  }
  if (combined.includes("OPUS")) {
    info.audio.push("Opus");
  }

  // Kodeki Wideo
  if (
    combined.includes("HEVC") ||
    combined.includes("H265") ||
    combined.includes("H.265") ||
    combined.includes("X265")
  ) {
    info.video.push(
      combined.includes("10BIT") || combined.includes("10-BIT") ? "HEVC (10-bit)" : "HEVC (H.265)"
    );
  } else if (
    combined.includes("AVC") ||
    combined.includes("H264") ||
    combined.includes("H.264") ||
    combined.includes("X264")
  ) {
    info.video.push("H.264 (AVC)");
  } else if (combined.includes("AV1")) {
    info.video.push("AV1");
  } else if (combined.includes("VP9")) {
    info.video.push("VP9");
  }

  // HDR
  if (
    combined.includes("DOVI") ||
    combined.includes("DOLBY VISION") ||
    combined.includes("DV") ||
    /\bDV\b/.test(combined)
  ) {
    info.hdr.push("Dolby Vision");
  }
  if (combined.includes("HDR10+") || combined.includes("HDR10PLUS")) {
    info.hdr.push("HDR10+");
  } else if (combined.includes("HDR10") || combined.includes("HDR")) {
    info.hdr.push("HDR10");
  }

  // Kontener
  if (combined.includes(".MKV") || combined.includes("MKV")) {
    info.container = "MKV";
  } else if (combined.includes(".MP4") || combined.includes("MP4")) {
    info.container = "MP4";
  } else if (combined.includes(".M3U8") || combined.includes("M3U8")) {
    info.container = "HLS (M3U8)";
  } else if (combined.includes(".TS") || combined.includes(" MPEGTS")) {
    info.container = "MPEG-TS";
  }

  return info;
}

/**
 * Wyciąga domenę/host z adresu URL.
 */
export function extractHostName(url = "") {
  try {
    const parsed = new URL(String(url || "").trim());
    return parsed.hostname || "";
  } catch (_) {
    return "";
  }
}

/**
 * Przeprowadza dokładną diagnozę przyczyny błędu odtwarzania.
 */
export function diagnosePlaybackFailure({
  mediaErrorCode = 0,
  httpStatus = 0,
  reason = "",
  runtimeDetail = "",
  avplayError = "",
  candidate = null,
  playbackUrl = "",
  platform = ""
} = {}) {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  const sourceText = `${candidate?.name || ""} ${candidate?.title || ""} ${candidate?.description || ""} ${playbackUrl || ""}`;
  const codecs = analyzeStreamCodecs(sourceText, playbackUrl);
  const parsedHttpStatus = Number(httpStatus || 0);
  const isVega =
    platform === "vega" || (typeof window !== "undefined" && window.__NUVIO_PLATFORM__ === "vega");
  const host = extractHostName(playbackUrl || candidate?.url);

  // 1. Brak sieci lokalnej
  if (online === false) {
    return {
      category: "internet",
      badge: "Brak połączenia z Internetem",
      icon: "🌐",
      title: "Problem z siecią lokalną",
      explanation:
        "Telewizor nie ma aktywnego połączenia z Internetem. Sprawdź stan sieci Wi-Fi w ustawieniach Fire TV.",
      recommendation:
        "Upewnij się, że urządzenie jest podłączone do Internetu, i spróbuj ponownie.",
      host,
      codecs
    };
  }

  // 2. Błędy serwera / Debrid / Hosta
  if (parsedHttpStatus === 401 || parsedHttpStatus === 403) {
    return {
      category: "host",
      badge: `Odmowa dostępu (HTTP ${parsedHttpStatus})`,
      icon: "🔒",
      title: "Odmowa dostępu do serwera (HTTP " + parsedHttpStatus + ")",
      explanation:
        "Serwer źródłowy odrzucił żądanie odtwarzania. Link bezpośredni wygasł lub Twoje konto Real-Debrid / AllDebrid wymaga ponownej autoryzacji.",
      recommendation:
        "Wybierz inne źródło z listy lub odśwież autoryzację konta Debrid w ustawieniach wtyczki.",
      host,
      codecs
    };
  }
  if (parsedHttpStatus === 404 || parsedHttpStatus === 410) {
    return {
      category: "host",
      badge: `Plik niedostępny (HTTP ${parsedHttpStatus})`,
      icon: "📡",
      title: "Plik nie istnieje na serwerze",
      explanation:
        "Serwer zgłosił, że ten plik wideo nie istnieje lub torrent nie jest scache'owany w chmurze (un-cached).",
      recommendation:
        "Wybierz inne źródło, najlepiej oznaczone jako zbuforowane [RD+] lub z dużą liczbą seedów.",
      host,
      codecs
    };
  }
  if (parsedHttpStatus >= 500 && parsedHttpStatus <= 599) {
    return {
      category: "host",
      badge: `Awaria serwera (HTTP ${parsedHttpStatus})`,
      icon: "⚠️",
      title: "Tymczasowa awaria serwera źródłowego",
      explanation: `Serwer udostępniający wideo zgłosił błąd wewnętrzny (HTTP ${parsedHttpStatus}). Serwer może być przeciążony.`,
      recommendation: "Wybierz inne źródło pochodzące od innego dostawcy/serwera.",
      host,
      codecs
    };
  }

  // 3. Niezgodność kodeków na Fire TV (np. DTS-HD, Dolby TrueHD, Dolby Vision)
  const hasDts = codecs.audio.some((a) => a.includes("DTS"));
  const hasTrueHd = codecs.audio.some((a) => a.includes("TrueHD"));
  const hasDovi = codecs.hdr.some((h) => h.includes("Dolby Vision"));
  const isCodecUnsupported =
    mediaErrorCode === 3 ||
    mediaErrorCode === 4 ||
    (typeof runtimeDetail === "string" &&
      (runtimeDetail.includes("format") ||
        runtimeDetail.includes("supported") ||
        runtimeDetail.includes("decode")));

  if (hasDts || hasTrueHd || (hasDovi && isVega)) {
    const unsupportedList = [];
    if (hasDts) unsupportedList.push("DTS / DTS-HD");
    if (hasTrueHd) unsupportedList.push("Dolby TrueHD");
    if (hasDovi && isVega) unsupportedList.push("Dolby Vision (profil DV)");

    return {
      category: "format",
      badge: "Nieobsługiwany kodek audio/wideo",
      icon: "🎞️",
      title: "Format nieobsługiwany przez Fire TV",
      explanation: `To wydanie zawiera kodek (${unsupportedList.join(", ")}), którego ten odtwarzacz Fire TV nie dekoduje sprzętowo. Z tego powodu serial nie może wystartować.`,
      recommendation:
        "Wybierz wydanie z powszechnym dźwiękiem AAC lub AC3 (Dolby Digital) oraz standardowym HDR10/SDR.",
      host,
      codecs
    };
  }

  if (isCodecUnsupported) {
    return {
      category: "format",
      badge: "Błąd dekodera wideo/audio",
      icon: "🎞️",
      title: "Odtwarzacz nie obsługuje tego strumienia",
      explanation: `Odtwarzacz systemowy zgłosił brak zgodności kodeka lub kontenera wideo (kod błędu: ${mediaErrorCode}).`,
      recommendation: "Wybierz źródło w formacie MP4 lub z kodekiem H.264 i dźwiękiem AAC.",
      host,
      codecs
    };
  }

  // 4. Przekroczenie limitu czasu (Startup Stall)
  if (reason === "startup-stall") {
    return {
      category: "stall",
      badge: "Brak danych od serwera (Stall)",
      icon: "⏱️",
      title: "Serwer nie rozpoczął transmisji wideo",
      explanation:
        "Odtwarzacz połączył się z adresem, ale przez 15 sekund nie otrzymał żadnych danych wideo od serwera (odebrano 0 klatek). Najczęściej oznacza to przeciążony host, zawieszony strumień lub nieobsługiwany kontener MKV bez indeksu klatek.",
      recommendation: "Wybierz inne źródło z listy lub wybierz mniejszy plik/inne wydanie.",
      host,
      codecs
    };
  }

  // 5. Błąd połączenia sieciowego podczas odtwarzania
  if (
    mediaErrorCode === 2 ||
    (typeof runtimeDetail === "string" && runtimeDetail.includes("network"))
  ) {
    return {
      category: "network",
      badge: "Błąd połączenia z serwerem",
      icon: "⚡",
      title: "Przerwane połączenie z serwerem źródłowym",
      explanation:
        "Wystąpił błąd transferu danych podczas łączenia z hostem. Serwer mógł zamknąć połączenie lub przepustowość łącza jest zbyt niska.",
      recommendation: "Wybierz inne źródło lub zrestartuj połączenie z siecią.",
      host,
      codecs
    };
  }

  // 6. Domyślny
  return {
    category: "unknown",
    badge: "Błąd odtwarzania",
    icon: "❓",
    title: "Nie udało się uruchomić strumienia",
    explanation:
      "Wystąpił nieoczekiwany problem z odtworzeniem wybranego materiału. Sprawdź poniższe parametry źródła.",
    recommendation: "Wybierz inne źródło z listy dostępnych strumieni.",
    host,
    codecs
  };
}
