import type { WikiRevision, WikiSourceReference, WikiSourceRevision } from "./knowledge-wiki";
import { validTextLocation, WikiRevisionSchema, WikiSourceRevisionSchema } from "./knowledge-wiki";

/** Canonical UTF-8 JSON, sorted by ASCII sourceRevisionId, without whitespace/newline.
 * Multiple excerpts of the same source revision contribute one pair, never one arbitrary source.
 * Call only after reference identity validation. All digests are lowercase SHA-256 hex.
 */
export function wikiSourceSetPayload(refs: readonly WikiSourceReference[]): string {
  const pairs = new Map(refs.map((ref) => [ref.sourceRevisionId, ref.artifactHash]));
  return JSON.stringify(
    [...pairs]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([sourceRevisionId, artifactHash]) => ({ sourceRevisionId, artifactHash })),
  );
}
export type WikiIntegrityResult =
  | { valid: true }
  | {
      valid: false;
      reason: "invalid_structure" | "missing_source" | "source_mismatch" | "hash_mismatch";
    };
/** Pure host verifier. The injected implementation MUST SHA-256 exact UTF-8 bytes.
 * This verifies content, not authority/eligibility or artifact existence; the host still reads and
 * verifies immutable blobs, then rechecks lifecycle/source state in the consuming transaction.
 */
export async function verifyWikiIntegrity(
  revision: WikiRevision,
  sources: readonly WikiSourceRevision[],
  sha256Utf8: (value: string) => Promise<string>,
): Promise<WikiIntegrityResult> {
  if (
    !WikiRevisionSchema.safeParse(revision).success ||
    sources.some((source) => !WikiSourceRevisionSchema.safeParse(source).success)
  )
    return { valid: false, reason: "invalid_structure" };
  const sourceMap = new Map(sources.map((source) => [source.sourceRevisionId, source]));
  const ids = new Set(revision.content.sourceRefs.map((ref) => ref.sourceRevisionId));
  if (sourceMap.size !== sources.length || sources.length !== ids.size)
    return { valid: false, reason: "source_mismatch" };
  if (
    (await sha256Utf8(revision.content.markdown)) !== revision.contentHash ||
    (await sha256Utf8(wikiSourceSetPayload(revision.content.sourceRefs))) !== revision.sourceSetHash
  )
    return { valid: false, reason: "hash_mismatch" };
  for (const ref of revision.content.sourceRefs) {
    const source = sourceMap.get(ref.sourceRevisionId);
    if (!source) return { valid: false, reason: "missing_source" };
    if (
      source.workspaceId !== revision.workspaceId ||
      source.sourceId !== ref.sourceId ||
      source.version !== ref.sourceVersion ||
      source.artifactHash !== ref.artifactHash ||
      !validTextLocation(source.sourceText, ref.location)
    )
      return { valid: false, reason: "source_mismatch" };
    if (
      (await sha256Utf8(source.sourceText)) !== source.artifactHash ||
      (await sha256Utf8(source.sourceText.slice(ref.location.start, ref.location.end))) !==
        ref.excerptHash
    )
      return { valid: false, reason: "hash_mismatch" };
  }
  return { valid: true };
}
