// Host-header allowlist for DNS-rebinding protection.
//
// Background: the panel binds 0.0.0.0:8080 and ships default credentials
// (admin / wechat). Without Host-header validation, a malicious site the
// operator visits can use DNS rebinding to point a hostname at the panel's
// LAN/loopback IP and drive every authenticated API from the operator's own
// browser — including the docker.sock-backed admin endpoints. The
// `sameSite: 'lax'` cookie does not stop this: after rebinding, the browser
// treats the attacker hostname as same-origin with the panel and includes
// any cookie it issues. The fix is host-allowlisting at the request edge.
//
// Default allowlist (covers documented deploys without operator action):
//   - loopback: localhost / 127.0.0.1 / ::1
//   - RFC1918 private LAN: 10/8, 172.16-31/12, 192.168/16
//   - link-local IPv4: 169.254/16
// Public hostnames (the recommended reverse-proxy deployment) must be added
// via PANEL_ALLOWED_HOSTS=<comma-separated>.

export function parseHost(headerHost: string | undefined): string {
  if (!headerHost) return '';
  const trimmed = headerHost.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']');
    if (close <= 0) return '';
    return trimmed.slice(0, close + 1).toLowerCase();
  }
  const colon = trimmed.lastIndexOf(':');
  const host = colon > 0 ? trimmed.slice(0, colon) : trimmed;
  return host.toLowerCase();
}

export function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1'
  );
}

export function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = [m[1], m[2], m[3], m[4]].map((s) => Number(s));
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  // 10.0.0.0/8
  if (o[0] === 10) return true;
  // 172.16.0.0/12
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  // 192.168.0.0/16
  if (o[0] === 192 && o[1] === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (o[0] === 169 && o[1] === 254) return true;
  return false;
}

export function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const lower = part.trim().toLowerCase();
    if (lower) out.push(lower);
  }
  return [...new Set(out)];
}

export function isAllowedHost(host: string, allowlist: string[]): boolean {
  if (!host) return false;
  if (isLoopbackHost(host)) return true;
  if (isPrivateIpv4(host)) return true;
  if (allowlist.includes(host)) return true;
  return false;
}
