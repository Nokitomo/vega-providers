import { ProviderContext, SettingsField } from "../types";

export const getSettingsSchema = async function ({
  providerContext: _providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> {
  return [
    {
      key: "debridService",
      type: "select",
      label: "Provider Debrid",
      description: "Servizio premium opzionale per stream diretti già in cache",
      options: [
        { label: "Nessuno (torrent P2P)", value: "none" },
        { label: "Real-Debrid", value: "realdebrid" },
        { label: "AllDebrid", value: "alldebrid" },
        { label: "Premiumize", value: "premiumize" },
        { label: "TorBox", value: "torbox" },
        { label: "Debrid-Link", value: "debridlink" },
      ],
      defaultValue: "none",
    },
    {
      key: "debridApiKey",
      type: "text",
      label: "Chiave API / Token Debrid",
      description: "Token opzionale del provider Debrid selezionato",
      placeholder: "Inserisci il tuo token API personale",
      defaultValue: "",
      secure: true,
    },
    {
      key: "qualityFilter",
      type: "select",
      label: "Risoluzione massima",
      options: [
        { label: "Tutte le qualità", value: "all" },
        { label: "Fino a 4K", value: "2160" },
        { label: "Fino a 1080p", value: "1080" },
        { label: "Fino a 720p", value: "720" },
        { label: "Fino a 480p", value: "480" },
      ],
      defaultValue: "all",
    },
    {
      key: "sortBy",
      type: "select",
      label: "Ordina risultati per",
      options: [
        { label: "Qualità, poi seeder", value: "qualitythenseeders" },
        { label: "Seeders", value: "seeders" },
        { label: "Dimensione file", value: "size" },
      ],
      defaultValue: "qualitythenseeders",
    },
    {
      key: "customInstanceUrl",
      type: "text",
      label: "URL istanza Torrentio",
      description: "Istanza self-hosted o proxy opzionale",
      placeholder: "https://torrentio.strem.fun",
      defaultValue: "https://torrentio.strem.fun",
    },
    {
      key: "includeP2PFallback",
      type: "toggle",
      label: "Includi torrent P2P",
      description:
        "Mostra i link magnet quando non è disponibile uno stream diretto in cache",
      defaultValue: true,
    },
  ];
};
