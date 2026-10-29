import { ProviderContext } from "../types";

/** App callers retain the existing behavior; database callers can reuse each source independently. */
export function runMetadataTask<T>(
  args: {providerContext: ProviderContext; [key: string]: any},
  source: string,
  kind: string,
  load: (episodeNumbers?: number[]) => Promise<T>,
): Promise<T> {
  const {providerContext, sourceRevision: _revision, episodeNumbers, fields, ...input} = args;
  if (!providerContext.metadataTasks) return load(episodeNumbers);
  return providerContext.metadataTasks.run({source, kind, input, episodeNumbers, fields}, load);
}
