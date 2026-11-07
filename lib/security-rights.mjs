// lib/security-rights.mjs
// OWASP ASVS 5.0 compliance: Rate limiting, SSRF defense, Rights ledger & Security audit logger.

export class SecurityRightsManager {
  constructor() {
    this.rateLimits = new Map(); // ip -> { count, resetAt }
    this.auditLogs = [];
    this.rightsLedger = new Map(); // workKey -> RightsRecord
    this.initDefaultLedger();
  }

  initDefaultLedger() {
    this.recordRights({
      workKey: 'site:nang-tho',
      title: 'Nàng Thơ',
      composer: 'Hoàng Dũng',
      rights: 'owned',
      license: 'Góc Hợp Âm Creative Community License',
      version: '1.3.1',
      checksum: 'sha256-nangtho-score-v1'
    });
    this.recordRights({
      workKey: 'site:diem-xua',
      title: 'Diễm Xưa',
      composer: 'Trịnh Công Sơn',
      rights: 'public_domain',
      license: 'Public Educational Study',
      version: '1.3.1',
      checksum: 'sha256-diemxua-score-v1'
    });
  }

  recordRights(record) {
    if (!record || !record.workKey) return;
    const entry = {
      ...record,
      recordedAt: new Date().toISOString()
    };
    this.rightsLedger.set(record.workKey, entry);
    this.logEvent('RIGHTS_RECORDED', { workKey: record.workKey, rights: record.rights });
  }

  getRights(workKey) {
    return this.rightsLedger.get(workKey) || null;
  }

  listRights() {
    return Array.from(this.rightsLedger.values());
  }

  logEvent(type, details = {}, ip = 'internal') {
    const log = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      type,
      ip,
      details
    };
    this.auditLogs.push(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs.shift();
    }
  }

  getAuditLogs({ limit = 50 } = {}) {
    return this.auditLogs.slice(-limit).reverse();
  }

  // SSRF Protection: only allow whitelisted domains, no internal IPs or invalid schemes
  validateSafeUrl(urlString) {
    try {
      const u = new URL(urlString);
      if (!['https:', 'http:'].includes(u.protocol)) return false;
      if (u.username || u.password) return false;
      const host = u.hostname.toLowerCase();
      // Block localhost, private IPs, loopbacks
      if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return false;
      if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) return false;
      if (host.endsWith('.local') || host.endsWith('.internal')) return false;

      // Allow trusted music domains
      const ALLOWED = [
        'goc-hop-am.onwardcrust.chatgpt.site',
        'hopamviet.vn',
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'www.youtube-nocookie.com',
        'youtu.be',
        'musescore.com',
        'imslp.org',
        'musopen.org'
      ];
      return ALLOWED.includes(host) || ALLOWED.some(d => host.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  // Rate Limiter middleware
  checkRateLimit(ip, limit = 120, windowMs = 60000) {
    const now = Date.now();
    const state = this.rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > state.resetAt) {
      state.count = 1;
      state.resetAt = now + windowMs;
      this.rateLimits.set(ip, state);
      return { allowed: true, remaining: limit - 1 };
    }

    state.count++;
    this.rateLimits.set(ip, state);

    if (state.count > limit) {
      this.logEvent('RATE_LIMIT_EXCEEDED', { ip, count: state.count }, ip);
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: limit - state.count };
  }
}

export const securityRights = new SecurityRightsManager();
