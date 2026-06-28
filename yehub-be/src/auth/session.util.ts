import { UAParser } from 'ua-parser-js';
import * as geoip from 'geoip-lite';

export interface SessionMetadata {
  deviceName: string;
  osName: string;
  ipAddress: string;
  location: string | null;
}

export function extractSessionMetadata(
  userAgent: string | undefined,
  ip: string | undefined,
): SessionMetadata {
  const parser = new UAParser(userAgent ?? '');
  const browser = parser.getBrowser();
  const os = parser.getOS();

  const deviceName = browser.name
    ? `${browser.name} ${browser.version ?? ''}`.trim()
    : 'Unknown Browser';

  const osName = os.name
    ? `${os.name} ${os.version ?? ''}`.trim()
    : 'Unknown OS';

  const ipAddress = ip ?? 'unknown';

  let location: string | null = null;
  if (ipAddress && ipAddress !== 'unknown') {
    const geo = geoip.lookup(ipAddress);
    if (geo) {
      location = [geo.city, geo.country].filter(Boolean).join(', ');
    }
  }

  return { deviceName, osName, ipAddress, location };
}
