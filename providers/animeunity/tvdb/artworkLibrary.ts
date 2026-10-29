import {ProviderContext} from '../../types';
import {runMetadataTask} from '../metadataTasks';
import {resolveField, resolveTvdbArtworkMetadata} from './artworkResolver';
import {fetchTvdbHtml} from './http';
import {extractTvdbEntityPath, parseTvdbArtworkGrid} from './parser';
import {TvdbArtworkField, TvdbMediaType} from './types';

export async function resolveTvdbArtworkLibrary(args: {
  providerContext: ProviderContext; tvdbId: number; mediaType: TvdbMediaType;
  mappedSeasons?: number[];
}) {
  const {providerContext, tvdbId, mediaType, mappedSeasons = []} = args;
  const baseArgs = {providerContext, tvdbId, mediaType};
  const series = await resolveTvdbArtworkMetadata(baseArgs);
  const seasons: Record<string, unknown> = {};
  if (mediaType === 'series') {
    const layout = await runMetadataTask(baseArgs, 'tvdb', 'artwork-season-layout', async () => {
      const entry = await fetchTvdbHtml(providerContext, `/?id=${tvdbId}&tab=series`);
      if (!entry) return null;
      const path = extractTvdbEntityPath(entry.html, 'series', entry.url);
      if (!path) return null;
      const $ = providerContext.cheerio.load(entry.html);
      const numbers = new Set<number>();
      $('a[href]').each((_: number, element: any) => {
        const href = String($(element).attr('href') || '').replace(/^https?:\/\/[^/]+/, '');
        if (!href.startsWith(`${path}/seasons/official/`)) return;
        const match = href.match(/\/seasons\/official\/(\d+)\/?$/);
        if (match) numbers.add(Number(match[1]));
      });
      return {path, numbers: [...numbers]};
    });
    for (const number of [...new Set([...(layout?.numbers || []), ...mappedSeasons])].sort((a, b) => a - b)) {
      if (!layout || !Number.isSafeInteger(number) || number < 0) continue;
      const fields: Record<string, unknown> = {};
      let page: ReturnType<typeof fetchTvdbHtml> | undefined;
      for (const field of ['poster', 'background', 'logo'] as TvdbArtworkField[]) {
        const result = await runMetadataTask({...baseArgs, seasonNumber: number, field, inventoryVersion: 1},
          'tvdb', 'season-image', async () => {
          page ||= fetchTvdbHtml(providerContext, `${layout.path}/seasons/official/${number}`);
          const response = await page;
          if (!response) return null;
          const url = await resolveField({providerContext, field,
            originalLanguage: series?.originalLanguage,
            candidates: parseTvdbArtworkGrid(response.html, providerContext.cheerio, field)});
          return url ? [url] : [];
        });
        fields[field] = {status: result == null ? 'unavailable' : result.length ? 'available' : 'missing',
          url: result?.[0], ...(!result?.length ? {inheritedFrom: `series.${field}`} : {})};
      }
      seasons[number] = fields;
    }
  }
  return {schemaVersion: 1, source: 'tvdb', id: tvdbId, mediaType, series, seasons};
}
