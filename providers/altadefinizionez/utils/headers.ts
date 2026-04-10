export const getUserAgent = (
  commonHeaders: Record<string, string>
): string => {
  return typeof commonHeaders["User-Agent"] === "string"
    ? commonHeaders["User-Agent"]
    : "";
};

export const attachUserAgentHeader = (
  headers: Record<string, string>,
  commonHeaders: Record<string, string>
): void => {
  const userAgent = getUserAgent(commonHeaders);
  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }
};
