const WEB_PROTOCOLS = new Set(["http:", "https:"]);

/** Absolute http(s) URL. Protocol-relative and scriptable schemes are not links. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\s\\]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (WEB_PROTOCOLS.has(url.protocol)) return trimmed;
  } catch {
    return null;
  }
  return null;
}

/**
 * Href for markdown prose. Keeps relative paths and http(s). Drops scriptable
 * schemes and protocol-relative URLs, which the markdown parser would otherwise
 * pass through.
 */
export function safeMarkdownHref(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\s\\]/.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return safeHttpUrl(trimmed);
  return trimmed;
}
