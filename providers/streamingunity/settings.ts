import { ProviderContext, SettingsField } from "../types";

export const getSettingsSchema = async ({
  providerContext: _providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> => [
  {
    key: "tmdbApiKey",
    type: "text",
    label: "Chiave API TMDB",
    description: "Opzionale: usa l'API TMDB prima delle pagine web, mantenendo i fallback attuali.",
    placeholder: "Inserisci la tua chiave API TMDB v3",
    defaultValue: "",
    secure: true,
  },
];
