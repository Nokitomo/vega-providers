export const catalog = [
  {
    title: "Serie TV del momento",
    titleKey: "Trending TV Series",
    filter: "catalog/all?sorting=popserie",
    staleTimeMs: 30 * 60 * 1000,
  },
  {
    title: "Film del momento",
    titleKey: "Trending Movies",
    filter: "catalog/all?sorting=popfilm",
    staleTimeMs: 30 * 60 * 1000,
  },
  {
    title: "Movie",
    titleKey: "Movie",
    filter: "film?tipo=1",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "TV Show",
    titleKey: "TV Show",
    filter: "film?tipo=2",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "Comedy",
    titleKey: "Comedy",
    filter: "commedia",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "Thriller",
    titleKey: "Thriller",
    filter: "thriller",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "Science Fiction",
    titleKey: "Science Fiction",
    filter: "fantascienza",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  {
    title: "Archive",
    titleKey: "Archive",
    filter: "catalog/all",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
];

export const genres = [
  {
    title: "Action",
    titleKey: "Action",
    filter: "azione",
  },
  {
    title: "Animation",
    titleKey: "Animation",
    filter: "animazione",
  },
  {
    title: "Comedy",
    titleKey: "Comedy",
    filter: "commedia",
  },
  {
    title: "Drama",
    titleKey: "Drama",
    filter: "drammatico",
  },
  {
    title: "Science Fiction",
    titleKey: "Science Fiction",
    filter: "fantascienza",
  },
  {
    title: "Thriller",
    titleKey: "Thriller",
    filter: "thriller",
  },
];
