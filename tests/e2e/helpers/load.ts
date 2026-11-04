// Loading a page the way the performance checks measure it: what its first load transfers, and Lighthouse's "slow 4G"
// throttling. Each is set up on a page before it navigates.
import type { Page } from '@playwright/test';

/** From now on, counts the bytes the page transfers (bodies and headers) and the fonts it requests. */
export function countRequests(page: Page): () => Promise<{ bytes: number; fonts: number }> {
  const sizes: Promise<number>[] = [];
  let fonts = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts++;
  });
  page.on('requestfinished', (request) => {
    sizes.push(request.sizes().then((size) => size.responseBodySize + size.responseHeadersSize));
  });
  return async () => ({ bytes: (await Promise.all(sizes)).reduce((sum, n) => sum + n, 0), fonts });
}

/** Lighthouse's "slow 4G": 150 ms round trips, 1.6 Mbps down and 750 kbps up, no cache, a CPU 4 times slower. */
export async function slow4g(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}
