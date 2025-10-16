const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const VOWEL_COUNT = 21;
const FINAL_CONSONANT_COUNT = 28;
const CYCLE = VOWEL_COUNT * FINAL_CONSONANT_COUNT;

export const CHOSEONG = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

const JUNGSEONG = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅘ',
  'ㅙ',
  'ㅚ',
  'ㅛ',
  'ㅜ',
  'ㅝ',
  'ㅞ',
  'ㅟ',
  'ㅠ',
  'ㅡ',
  'ㅢ',
  'ㅣ',
] as const;

const JONGSEONG = [
  '',
  'ㄱ',
  'ㄲ',
  'ㄳ',
  'ㄴ',
  'ㄵ',
  'ㄶ',
  'ㄷ',
  'ㄹ',
  'ㄺ',
  'ㄻ',
  'ㄼ',
  'ㄽ',
  'ㄾ',
  'ㄿ',
  'ㅀ',
  'ㅁ',
  'ㅂ',
  'ㅄ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

const NON_WORD_CHARACTERS = /[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9]/g;

const sanitizeSequence = (value: string) =>
  value.toLowerCase().replace(/\s+/g, '').replace(NON_WORD_CHARACTERS, '');

const isHangulSyllable = (code: number) => code >= HANGUL_BASE && code <= HANGUL_LAST;

export const extractChoseong = (text: string) =>
  Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (!isHangulSyllable(code)) {
        return char;
      }

      const offset = code - HANGUL_BASE;
      const index = Math.floor(offset / CYCLE);
      return CHOSEONG[index];
    })
    .join('');

export const disassembleHangul = (text: string) =>
  Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (!isHangulSyllable(code)) {
        return char;
      }

      const offset = code - HANGUL_BASE;
      const choseongIndex = Math.floor(offset / CYCLE);
      const jungseongIndex = Math.floor((offset % CYCLE) / FINAL_CONSONANT_COUNT);
      const jongseongIndex = offset % FINAL_CONSONANT_COUNT;

      return `${CHOSEONG[choseongIndex]}${JUNGSEONG[jungseongIndex]}${JONGSEONG[jongseongIndex]}`;
    })
    .join('');

export type PhonemeProfile = {
  combined: string;
  initial: string;
  medial: string;
  final: string;
};

export const createPhonemeProfile = (text: string): PhonemeProfile => {
  let initial = '';
  let medial = '';
  let final = '';
  let combined = '';

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (!isHangulSyllable(code)) {
      const normalized = sanitizeSequence(char);
      initial += normalized;
      medial += normalized;
      final += normalized;
      combined += normalized;
      continue;
    }

    const offset = code - HANGUL_BASE;
    const choseongIndex = Math.floor(offset / CYCLE);
    const jungseongIndex = Math.floor((offset % CYCLE) / FINAL_CONSONANT_COUNT);
    const jongseongIndex = offset % FINAL_CONSONANT_COUNT;

    const choseong = CHOSEONG[choseongIndex];
    const jungseong = JUNGSEONG[jungseongIndex];
    const jongseong = JONGSEONG[jongseongIndex];

    initial += choseong;
    medial += jungseong;
    if (jongseong) {
      final += jongseong;
    }
    combined += `${choseong}${jungseong}${jongseong}`;
  }

  return {
    combined: sanitizeSequence(combined),
    initial: sanitizeSequence(initial),
    medial: sanitizeSequence(medial),
    final: sanitizeSequence(final),
  };
};

export const normalizeForComparison = (text: string) => createPhonemeProfile(text).combined;

export const levenshteinDistance = (a: string, b: string) => {
  if (a === b) {
    return 0;
  }

  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  const currentRow = new Array<number>(b.length + 1);

  for (let i = 0; i < a.length; i += 1) {
    currentRow[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const insertionCost = currentRow[j]! + 1;
      const deletionCost = previousRow[j + 1]! + 1;
      const substitutionCost = previousRow[j]! + (a[i] === b[j] ? 0 : 1);
      currentRow[j + 1] = Math.min(insertionCost, deletionCost, substitutionCost);
    }

    for (let j = 0; j < currentRow.length; j += 1) {
      previousRow[j] = currentRow[j]!;
    }
  }

  return previousRow[b.length]!;
};

export const similarityScore = (a: string, b: string) => {
  if (!a.length && !b.length) {
    return 1;
  }

  if (!a.length || !b.length) {
    return 0;
  }

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  return Math.max(0, 1 - distance / maxLength);
};
