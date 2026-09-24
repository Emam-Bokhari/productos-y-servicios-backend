/**
 * Search Helper Utility
 * Industry-standard fuzzy search, typo-tolerance, diacritics/accent normalization,
 * and relevance ranking for MongoDB / Mongoose queries.
 */

/**
 * Escapes regex special characters safely to prevent RegExp injection / ReDoS.
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Normalizes Spanish and Latin characters to match accented & unaccented equivalents.
 * e.g., 'a' matches [aáàâãä], 'n' matches [nñ], etc.
 */
export const accentFoldChar = (ch: string): string => {
  const map: Record<string, string> = {
    a: "[aáàâãä]",
    e: "[eéèêë]",
    i: "[iíìîï]",
    o: "[oóòôõö]",
    u: "[uúùûü]",
    n: "[nñ]",
    c: "[cç]",
    á: "[aáàâãä]",
    é: "[eéèêë]",
    í: "[iíìîï]",
    ó: "[oóòôõö]",
    ú: "[uúùûü]",
    ñ: "[nñ]",
    ç: "[cç]",
  };
  return map[ch.toLowerCase()] || escapeRegex(ch);
};

/**
 * Generates typo-tolerant fuzzy regex patterns for a single token.
 * Handles:
 * 1. Accent & diacritics variations (e.g. cafe <-> café, nino <-> niño)
 * 2. Missing character tolerance (e.g. 'piza' matches 'pizza')
 * 3. Extra character tolerance (e.g. 'pizzza' matches 'pizza')
 * 4. Swapped adjacent characters / transposition (e.g. 'pziza' or 'tehc' matches 'tech')
 * 5. Single character substitution (e.g. 'burgar' matches 'burger', 'chuso' matches 'chuzo')
 */
export const generateFuzzyPatternsForWord = (rawWord: string): string[] => {
  const word = rawWord.toLowerCase().trim();
  if (!word) return [];

  // Limit word length to prevent unbounded regex expansion
  const cleanWord = word.slice(0, 30);

  // For very short words (1-2 chars), do accent-folded exact match only
  if (cleanWord.length <= 2) {
    return [cleanWord.split("").map(accentFoldChar).join("")];
  }

  const patterns = new Set<string>();
  const baseChars = cleanWord.split("").map(accentFoldChar);

  // 1. Exact match with accent folding
  patterns.add(baseChars.join(""));

  // 2. Missing character tolerance (user typed fewer letters e.g. 'piza' -> matches 'pizza')
  // Allow single optional alphanumeric or accented character between letters
  if (cleanWord.length >= 4) {
    for (let i = 1; i < baseChars.length; i++) {
      const copy = [...baseChars];
      copy.splice(i, 0, "[a-zA-Z0-9áéíóúñç]?");
      patterns.add(copy.join(""));
    }
  }

  // 3. Extra character tolerance (user typed an extra letter e.g. 'pizzza' -> matches 'pizza')
  // We preserve the first letter for accurate prefix matching
  if (cleanWord.length >= 4) {
    for (let i = 1; i < cleanWord.length; i++) {
      const variant = cleanWord.slice(0, i) + cleanWord.slice(i + 1);
      if (variant.length >= 3) {
        patterns.add(variant.split("").map(accentFoldChar).join(""));
      }
    }
  }

  // 4. Adjacent character transposition (user swapped 2 adjacent letters e.g. 'tehc' -> 'tech')
  for (let i = 0; i < cleanWord.length - 1; i++) {
    const swapped =
      cleanWord.slice(0, i) +
      cleanWord[i + 1] +
      cleanWord[i] +
      cleanWord.slice(i + 2);
    patterns.add(swapped.split("").map(accentFoldChar).join(""));
  }

  // 5. Single character substitution (user mistyped 1 letter e.g. 'burgar' -> matches 'burger')
  // Preserve first letter so short words don't match arbitrary words with same suffix
  if (cleanWord.length >= 4) {
    for (let i = 1; i < baseChars.length; i++) {
      const copy = [...baseChars];
      copy[i] = "[a-zA-Z0-9áéíóúñç]";
      patterns.add(copy.join(""));
    }
  }

  return Array.from(patterns);
};

/**
 * Builds a compiled RegExp for a given search query.
 * Splits multi-word phrases and combines phrase + token fuzzy patterns.
 */
export const buildFuzzySearchRegex = (searchTerm: string): RegExp | null => {
  if (!searchTerm || typeof searchTerm !== "string") return null;
  const trimmed = searchTerm.trim();
  if (!trimmed) return null;

  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const allPatterns = new Set<string>();

  // If multi-word, allow matching the full phrase (with accents and flexible spaces)
  if (tokens.length > 1) {
    const fullPhrasePattern = tokens
      .map((t) => t.split("").map(accentFoldChar).join(""))
      .join("[\\s\\-_]+");
    allPatterns.add(fullPhrasePattern);
  }

  // Generate fuzzy patterns for each word token
  for (const token of tokens) {
    const pats = generateFuzzyPatternsForWord(token);
    for (const p of pats) {
      allPatterns.add(p);
    }
  }

  if (allPatterns.size === 0) return null;

  try {
    return new RegExp(`(?:${Array.from(allPatterns).join("|")})`, "i");
  } catch {
    return new RegExp(escapeRegex(trimmed), "i");
  }
};

/**
 * Calculates a relevance score for ranking search results.
 * Higher score means more relevant. Returns 0 if no match.
 */
export const calculateRelevanceScore = (
  text: string | null | undefined,
  query: string,
  regex?: RegExp | null,
): number => {
  if (!text || !query) return 0;

  const target = text.toLowerCase().trim();
  const q = query.toLowerCase().trim();

  if (target === q) return 100;
  if (target.startsWith(q)) return 80;

  // Word boundary match
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(q)}\\b`, "i");
  if (wordBoundaryRegex.test(target)) return 70;

  // Contains full query as substring
  if (target.includes(q)) return 50;

  // Check individual tokens
  const tokens = q.split(/\s+/).filter(Boolean);
  let tokenMatches = 0;
  for (const token of tokens) {
    if (target.includes(token)) {
      tokenMatches++;
    }
  }

  if (tokens.length > 0 && tokenMatches > 0) {
    return 30 + Math.round((tokenMatches / tokens.length) * 20);
  }

  // Fuzzy match via regex
  if (regex && regex.test(target)) {
    return 30;
  }

  return 0;
};
