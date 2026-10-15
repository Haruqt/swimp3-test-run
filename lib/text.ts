// Names in several raw source datasets (water infrastructure, turnouts,
// barangay names, etc.) come straight from the original KML/qgis2web
// export and are inconsistently lowercase — e.g. "kulalapat west tabacal
// pumping station". Reformatting on display instead of editing hundreds
// of raw entries by hand. Small connector words stay lowercase mid-name
// (normal title-case convention) unless they're the very first word.
const TITLE_CASE_MINOR_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to"]);

export function toTitleCase(text: string): string {
  return text
    .split(" ")
    .map((word, i) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (i > 0 && TITLE_CASE_MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}