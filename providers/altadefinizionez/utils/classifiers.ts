export const isSuperVideo = (href: string): boolean =>
  /supervideo\./i.test(href) || href.toLowerCase().includes("supervideo");

export const isDroploadLike = (href: string): boolean =>
  /(?:dropload|dr0pstream)\./i.test(href);

export const isVixsrcLike = (href: string): boolean =>
  /(?:vixsrc|vixcloud)\./i.test(href);

export const isMixdropLike = (href: string): boolean =>
  /(?:mixdrop|m1xdrop)\./i.test(href);

export const isStreamHgLike = (href: string): boolean =>
  /(?:streamhg|dhcplay)\./i.test(href);
