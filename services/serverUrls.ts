const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const configuredOrigin = (import.meta.env.VITE_SERVER_ORIGIN || '').trim();
const serverOrigin = configuredOrigin ? trimTrailingSlash(configuredOrigin) : '';
const devPrefix = import.meta.env.DEV && !serverOrigin ? '/api' : '';

export const buildServerUrl = (path: `/${string}`): string => {
  return serverOrigin ? `${serverOrigin}${path}` : `${devPrefix}${path}`;
};
