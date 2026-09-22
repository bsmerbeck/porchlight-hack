const KEY = 'porchlight:ref';

export function captureRef(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('ref');
  if (fromUrl) sessionStorage.setItem(KEY, fromUrl.slice(0, 32));
  return sessionStorage.getItem(KEY) ?? 'direct';
}
