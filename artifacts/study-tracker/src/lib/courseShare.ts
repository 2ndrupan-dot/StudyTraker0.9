// ── Subject-tree helpers for partial (subject-level) course sharing ──────────
// Shared between AdminContext (initial share snapshot) and StudyContext
// (live-sync relay on every subsequent save) so both paths apply the exact
// same "only these subjects" filter — see courseShare-live-sync memory note
// for why the live-sync path used to skip this and leak all subjects back in.

// Collect every node id across all levels of a subjects tree, so a flat
// "notes" map (keyed like "s:<id>", "c:<id>", "pt:<id>" ...) can be filtered
// down to just the ids that belong to a chosen set of top-level subjects.
export function collectAllIds(nodes: unknown[], into: Set<string> = new Set()): Set<string> {
  const childKeys = ['chapters', 'topics', 'subtopics', 'concepts', 'points'];
  for (const n of nodes as Record<string, unknown>[]) {
    if (n.id) into.add(n.id as string);
    for (const key of childKeys) {
      if (Array.isArray(n[key])) collectAllIds(n[key] as unknown[], into);
    }
  }
  return into;
}

export function filterSubjectsByIds(subjects: unknown[], ids: string[]): unknown[] {
  const idSet = new Set(ids);
  return (subjects as Record<string, unknown>[]).filter(s => idSet.has(s.id as string));
}

export function filterNotesMapByIds(notes: Record<string, string>, idSet: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    const sep = key.indexOf(':');
    const rawId = sep >= 0 ? key.slice(sep + 1) : key;
    if (idSet.has(rawId)) result[key] = value;
  }
  return result;
}
