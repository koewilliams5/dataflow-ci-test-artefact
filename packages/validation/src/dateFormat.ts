const TOKEN_PATTERN = /YYYY|MM|DD|HH|mm|ss/g;
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

interface CompiledFormat {
  regex: RegExp;
  tokenOrder: string[];
}

const compiledFormatCache = new Map<string, CompiledFormat>();

function compileFormat(format: string): CompiledFormat {
  const cached = compiledFormatCache.get(format);
  if (cached) return cached;

  const tokenOrder: string[] = [];
  const escaped = format.replace(REGEX_SPECIAL_CHARS, "\\$&");
  const patternSource = escaped.replace(TOKEN_PATTERN, (token) => {
    tokenOrder.push(token);
    return token === "YYYY" ? "(\\d{4})" : "(\\d{2})";
  });

  const compiled: CompiledFormat = { regex: new RegExp(`^${patternSource}$`), tokenOrder };
  compiledFormatCache.set(format, compiled);
  return compiled;
}

/**
 * Parseur de dates minimaliste supportant les tokens YYYY/MM/DD/HH/mm/ss —
 * suffisant pour le format donné en exemple par le brief ("YYYY-MM-DD") et
 * ses variantes datetime, sans dépendre d'une bibliothèque de dates pour un
 * besoin aussi étroit. Retourne `null` si la valeur ne correspond pas au
 * format, ou si la date n'existe pas (ex. "2026-02-30" ne "round-trip" pas).
 */
export function parseDateWithFormat(value: string, format: string): Date | null {
  const { regex, tokenOrder } = compileFormat(format);
  const match = regex.exec(value);
  if (!match) {
    return null;
  }

  const parts = { YYYY: 1970, MM: 1, DD: 1, HH: 0, mm: 0, ss: 0 };
  tokenOrder.forEach((token, index) => {
    if (token in parts) {
      parts[token as keyof typeof parts] = Number(match[index + 1]);
    }
  });

  const date = new Date(Date.UTC(parts.YYYY, parts.MM - 1, parts.DD, parts.HH, parts.mm, parts.ss));

  if (
    date.getUTCFullYear() !== parts.YYYY ||
    date.getUTCMonth() !== parts.MM - 1 ||
    date.getUTCDate() !== parts.DD ||
    date.getUTCHours() !== parts.HH ||
    date.getUTCMinutes() !== parts.mm
  ) {
    return null;
  }

  return date;
}
