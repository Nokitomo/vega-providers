import {ProviderContext} from '../../types';
import {readTmdbApiKey, resolveApiImageInventory} from './api';
import {resolveTmdbArtworkMetadata} from './artworkResolver';
import {resolveTmdbSeasonLayout} from './client';
import {fetchTmdbHtml} from './http';
import {parseTmdbImageGallery} from './images';
import {buildLocalePriority, buildLogoLocalePriority, languageCodeFromLocale} from './locales';
import {TmdbImageMetadata, TmdbMediaType} from './types';
import {runMetadataTask} from '../metadataTasks';

type ImageSlot = {status: 'available' | 'missing' | 'unavailable'; selected?: TmdbImageMetadata; candidates: TmdbImageMetadata[]};
type ImageFields = Record<string, Record<string, ImageSlot>>;
const routes = {poster: {route: 'posters', type: 'poster'},
  background: {route: 'backdrops', type: 'backdrop'}, logo: {route: 'logos', type: 'logo'}} as const;

/** Inventory uses the same gallery order as the provider, independently for each language. */
export async function resolveTmdbArtworkLibrary(args: {
  providerContext: ProviderContext; id: number; type: TmdbMediaType;
}) {
  const {providerContext, id, type} = args;
  const selected = await resolveTmdbArtworkMetadata({...args, fields: ['poster', 'background', 'logo']});
  const originalLanguage = selected?.originalLanguage;
  const apiKey = await readTmdbApiKey(providerContext);
  const collect = async (seasonNumber?: number): Promise<ImageFields> => {
    const output: ImageFields = {};
    let apiPromise: ReturnType<typeof resolveApiImageInventory> | undefined;
    for (const field of (seasonNumber == null ? ['poster', 'background', 'logo'] : ['poster']) as Array<keyof typeof routes>) {
      output[field] = {};
      const config = routes[field];
      const locales = field === 'logo' ? buildLogoLocalePriority() : buildLocalePriority(originalLanguage);
      for (const locale of locales) {
        const language = languageCodeFromLocale(locale);
        const candidates = await runMetadataTask({...args, seasonNumber, field, language,
          inventoryVersion: 1}, 'tmdb', 'image-language', async () => {
          if (apiKey) {
            apiPromise ||= resolveApiImageInventory({...args, apiKey, seasonNumber});
            const api = await apiPromise;
            if (api) return api.images[config.route].filter(image => image.language === language);
          }
          const base = `/${type}/${id}${seasonNumber == null ? '' : `/season/${seasonNumber}`}`;
          const html = await fetchTmdbHtml(providerContext, `${base}/images/${config.route}`, locale);
          if (!html) return null;
          // Unknown language must not be relabelled as whichever locale was requested.
          return parseTmdbImageGallery(html, providerContext.cheerio, config.type, 'unknown')
            .filter(image => image.language === language);
        });
        output[field][language] = {status: candidates == null ? 'unavailable' : candidates.length ? 'available' : 'missing',
          selected: candidates?.[0], candidates: candidates || []};
      }
    }
    return output;
  };
  const series = await collect();
  const seasons: Record<string, unknown> = {};
  if (type === 'tv') {
    const layout = await resolveTmdbSeasonLayout({providerContext, id});
    for (const season of layout || []) {
      seasons[season.seasonNumber] = {images: await collect(season.seasonNumber),
        // TMDB season galleries expose posters; series logos/backgrounds remain explicitly inherited.
        logo: {status: 'unsupported', inheritedFrom: 'series.logo'},
        background: {status: 'unsupported', inheritedFrom: 'series.background'}};
    }
  }
  return {schemaVersion: 1, source: 'tmdb', id, type, originalLanguage, series, seasons};
}
