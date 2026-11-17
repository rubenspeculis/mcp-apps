function parseOrigin(value: string): URL | null {
  // URL accepts full URLs and repairs some malformed inputs. Check the origin
  // syntax first so paths, credentials and whitespace cannot be normalised away.
  const authority = /^https?:\/\/(.+)$/i.exec(value)?.[1];
  if (!authority || /[\s\p{Cc}/?#\\@*%]/u.test(authority)) return null;
  if (!/^(?:\[[\da-f:.]+\]|[^:[\]]+)(?::\d+)?$/i.test(authority)) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // IDNA conversion can turn a fullwidth star into an ASCII wildcard.
    if (url.hostname.includes("*")) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Compile HTTP(S) origin declarations, retaining invalid entries verbatim.
 * Matching normalises case and default ports, but never crosses schemes or ports.
 * A leading `*.` matches both the apex and subdomains at any depth.
 * Invalid declarations grant no access; malformed origin input is always denied.
 */
export function createOriginPolicy(declarations: readonly string[]): {
  invalid: string[];
  allows(origin: string): boolean;
} {
  const invalid: string[] = [];
  const exact = new Set<string>();
  const wildcards: URL[] = [];
  for (const declaration of declarations) {
    const origin = declaration.replace(/^(https?:\/\/)\*\./i, "$1");
    const wildcard = origin !== declaration;
    const parsed = parseOrigin(origin);
    if (!parsed) invalid.push(declaration);
    else if (wildcard) wildcards.push(parsed);
    else exact.add(parsed.origin);
  }

  return {
    invalid,
    allows(origin) {
      const parsed = parseOrigin(origin);
      if (!parsed) return false;
      if (exact.has(parsed.origin)) return true;
      return wildcards.some(
        (rule) =>
          parsed.protocol === rule.protocol &&
          parsed.port === rule.port &&
          (parsed.hostname === rule.hostname || parsed.hostname.endsWith(`.${rule.hostname}`)),
      );
    },
  };
}
