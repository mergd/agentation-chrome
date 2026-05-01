export type PageTarget = {
  origin: string;
  pattern: string;
  url: string;
};

const supportedProtocols = new Set(["http:", "https:"]);

export function getPageTarget(url: string | undefined): PageTarget | null {
  if (!url) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!supportedProtocols.has(parsed.protocol)) {
    return null;
  }

  return {
    origin: parsed.origin,
    pattern: `${parsed.protocol}//${parsed.hostname}/*`,
    url: parsed.href
  };
}

export function contentScriptIdForPattern(pattern: string): string {
  const encoded = pattern.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80);
  return `agentation_${encoded}`;
}
