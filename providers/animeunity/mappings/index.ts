export { ANIBRIDGE_MAPPINGS_URL, parseAniBridgePayload } from "./anibridge";
export { parseAniBridgeDescriptor, parseSeasonScope } from "./descriptors";
export {
  PLEXANIBRIDGE_MAPPINGS_URL,
  parsePlexAniBridgePayload,
} from "./legacyImdb";
export { mapAniBridgeEpisodeRange, resolveAniBridgeEpisodeMappings } from "./ranges";
export { buildAniBridgeExtra, resolveAnimeMappings } from "./resolver";
export type {
  AniBridgeDescriptor,
  AniBridgeIndex,
  AniBridgeTarget,
  AnimeMappingResolution,
  EpisodeMappingResolution,
} from "./types";
