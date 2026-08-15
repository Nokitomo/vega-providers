import { ProviderContext, Stream } from "../../types";
import { GUARDAHD_BASE, REQUEST_TIMEOUT } from "../utils/constants";
import {
  extractVixsrcData,
  resolveVixsrcStream as resolveSharedVixsrcStream,
} from "../../vixsrcExtractor";

export { extractVixsrcData };

export const resolveVixsrcStream = async ({
  normalizedUrl,
  index,
  providerContext,
  signal,
}: {
  normalizedUrl: string;
  index: number;
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<Stream | null> => {
  return resolveSharedVixsrcStream({
    url: normalizedUrl,
    server: `Server 1 ${index}`,
    providerContext,
    signal,
    requestReferer: `${GUARDAHD_BASE}/`,
    timeoutMs: REQUEST_TIMEOUT,
  });
};
