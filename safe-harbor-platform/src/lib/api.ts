const DEFAULT_API_ROOT = "https://safeguard1.onrender.com";

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const API_ROOT = trimTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_API_ROOT);

export const API_BASE_URL = API_ROOT.endsWith("/api") ? API_ROOT : `${API_ROOT}/api`;

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === "/api") {
    return API_BASE_URL;
  }

  if (normalizedPath.startsWith("/api/")) {
    return `${API_BASE_URL}${normalizedPath.slice(4)}`;
  }

  return `${API_BASE_URL}${normalizedPath}`;
};

export const uploadUrl = (path: string) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
  return `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;
};

export const configureApiFetch = () => {
  if (typeof window === "undefined") return;

  const currentWindow = window as typeof window & { __safeGuardFetchPatched?: boolean };
  if (currentWindow.__safeGuardFetchPatched) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return nativeFetch(apiUrl(input), init);
    }

    if (input instanceof URL && input.pathname.startsWith("/api") && input.origin === window.location.origin) {
      return nativeFetch(apiUrl(`${input.pathname}${input.search}`), init);
    }

    if (input instanceof Request) {
      const requestUrl = new URL(input.url);
      if (requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api")) {
        return nativeFetch(new Request(apiUrl(`${requestUrl.pathname}${requestUrl.search}`), input), init);
      }
    }

    return nativeFetch(input, init);
  };

  currentWindow.__safeGuardFetchPatched = true;
};
