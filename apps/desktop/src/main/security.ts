/** Only the exact application entry is trusted; fragments do not replace its document. */
export const isTrustedRendererUrl = (candidate: string, expected: string): boolean => {
  try {
    const actual = new URL(candidate);
    const trusted = new URL(expected);
    actual.hash = '';
    trusted.hash = '';
    return actual.href === trusted.href;
  } catch {
    return false;
  }
};

export const validateDevServerUrl = (value: string, packaged: boolean): string => {
  if (value === '') return '';
  const url = new URL(value);
  if (
    packaged ||
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('AURALIDE_DEV_SERVER_URL must be a local HTTP URL in an unpackaged app');
  }
  return url.href;
};
