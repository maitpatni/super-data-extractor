const App = {
  historyCache: [],
  activityCache: [],
  historyPreviewId: null,
  currentUser: null,
  publicRoutes: new Set(['/login', '/register']),
  pageMeta: {
    '/': { title: 'Dashboard', eyebrow: 'Operations' },
    '/google-maps': { title: 'Google Maps', eyebrow: 'Extractor' },
    '/linkedin': { title: 'LinkedIn', eyebrow: 'Extractor' },
    '/history': { title: 'History', eyebrow: 'Archive' },
    '/settings': { title: 'Settings', eyebrow: 'Configuration' },
    '/login': { title: 'Login', eyebrow: 'Authentication' },
    '/register': { title: 'Register', eyebrow: 'Authentication' },
  },

  Progress: {
    total: 0,
    current: 0,
    title: '',
    timerStartedAt: 0,
    currentPlace: '',

    start(title, total, description) {
      this.total = Math.max(total, 1);
      this.current = 0;
      this.title = title;
      this.currentPlace = '';
      this.timerStartedAt = Date.now();
      document.getElementById('progressTitle').textContent = title;
      document.getElementById('progressText').textContent = description || 'Preparing request';
      document.getElementById('progressCurrentPlace').textContent = 'Waiting for first record';
      document.getElementById('progressFill').style.width = '0%';
      document.getElementById('progressCount').textContent = `0 / ${this.total}`;
      document.getElementById('progressEta').textContent = 'ETA calculating';
      document.getElementById('progressDialog').classList.add('open');
    },

    tick(description) {
      this.current = Math.min(this.current + 1, Math.max(this.total - 1, 1));
      this.update(description);
    },

    update(description, options = {}) {
      if (Number.isFinite(options.current)) {
        this.current = options.current;
      }
      if (Number.isFinite(options.total) && options.total > 0) {
        this.total = options.total;
      }

      const percent = Utils.clamp(Math.round((this.current / this.total) * 100), 0, 100);
      document.getElementById('progressFill').style.width = `${percent}%`;
      document.getElementById('progressCount').textContent = `${this.current} / ${this.total}`;
      if (description) {
        document.getElementById('progressText').textContent = description;
      }

      const explicitEta = Number.isFinite(options.eta) ? options.eta : null;
      const elapsed = (Date.now() - this.timerStartedAt) / 1000;
      const computedEta = this.current > 0 ? Math.max(Math.round((elapsed / this.current) * (this.total - this.current)), 0) : 0;
      const eta = explicitEta ?? computedEta;
      document.getElementById('progressEta').textContent = eta ? `ETA ~${eta}s` : 'Finalizing';

      const currentPlace = options.currentPlace || this.currentPlace;
      this.currentPlace = currentPlace || '';
      document.getElementById('progressCurrentPlace').textContent = this.currentPlace
        ? `Current place: ${this.currentPlace}`
        : 'Waiting for first record';
    },

    finish(finalCount, description) {
      this.current = Math.max(finalCount, this.total);
      this.total = Math.max(finalCount, this.total);
      this.update(description || 'Completed', { current: this.current, total: this.total, eta: 0 });
      document.getElementById('progressCount').textContent = `${finalCount} / ${Math.max(finalCount, this.total)}`;
      window.setTimeout(() => this.stop(), 450);
    },

    stop() {
      document.getElementById('progressDialog').classList.remove('open');
    },
  },

  async init() {
    this.applyTheme();
    this.bindShellEvents();
    this.registerRoutes();
    await this.restoreSession();
    if (this.currentUser) {
      await this.syncSettings();
    }
    this.applyTheme();
    this.refreshUserUI();
    this.routeAfterAuthBootstrap();
    Router.init();
  },

  isAuthenticated() {
    return Boolean(this.currentUser && Utils.getAuthToken());
  },

  async restoreSession() {
    const token = Utils.getAuthToken();
    const cachedUser = Utils.getCurrentUser();

    if (!token) {
      this.currentUser = null;
      return null;
    }

    try {
      const response = await Api.getCurrentUser();
      this.currentUser = response.user;
      Utils.saveCurrentUser(response.user);
      return response.user;
    } catch (error) {
      this.currentUser = null;
      Utils.clearSession();
      if (cachedUser) {
        Utils.showToast('Session expired', 'Please log in again.', 'warning');
      }
      return null;
    }
  },

  routeAfterAuthBootstrap() {
    const currentRoute = Router.current();
    if (!this.isAuthenticated() && !this.publicRoutes.has(currentRoute)) {
      Router.navigate('/login');
      return;
    }
    if (this.isAuthenticated() && this.publicRoutes.has(currentRoute)) {
      Router.navigate('/');
    }
  },

  async syncSettings() {
    try {
      const serverSettings = await Api.getSettings();
      const localSettings = Utils.getSettings();
      const theme = Utils.getThemePreference() || serverSettings.theme || localSettings.theme;
      Utils.saveSettings({
        ...localSettings,
        ...serverSettings,
        theme,
        googleMapsApiKey: serverSettings.googleMapsApiKey || '',
        linkedinApiKey: serverSettings.linkedinApiKey || '',
        validations: {
          ...localSettings.validations,
          ...serverSettings.validations,
          googleMaps: {
            ...(localSettings.validations?.googleMaps || {}),
            ...(serverSettings.validations?.googleMaps || {}),
          },
          linkedin: {
            ...(localSettings.validations?.linkedin || {}),
            ...(serverSettings.validations?.linkedin || {}),
          },
        },
      });
    } catch (error) {
      Utils.getSettings();
    }
  },

  async loadHistory(force = false) {
    if (this.historyCache.length && !force) {
      return this.historyCache;
    }

    try {
      this.historyCache = await Api.getHistory();
    } catch (error) {
      this.historyCache = [];
      Utils.showToast('History unavailable', 'Could not load extraction history from the server.', 'warning');
    }

    return this.historyCache;
  },

  async loadActivity(force = false) {
    if (this.activityCache.length && !force) {
      return this.activityCache;
    }

    try {
      this.activityCache = await Api.getActivity();
    } catch (error) {
      this.activityCache = [];
    }

    return this.activityCache;
  },

  bindShellEvents() {
    document.getElementById('menuToggle').addEventListener('click', () => this.openSidebar());
    document.getElementById('sidebarClose').addEventListener('click', () => this.closeSidebar());
    document.getElementById('appBackdrop').addEventListener('click', () => this.closeSidebar());
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('progressClose').addEventListener('click', () => this.Progress.stop());
    document.getElementById('userLogout')?.addEventListener('click', () => this.logout());
    document.getElementById('sidebarLogout')?.addEventListener('click', () => this.logout());

    document.getElementById('sidebarNav').addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        this.closeSidebar();
      }
    });
  },

  openSidebar() {
    document.querySelector('.app-shell').classList.add('sidebar-open');
  },

  closeSidebar() {
    document.querySelector('.app-shell').classList.remove('sidebar-open');
  },

  applyTheme() {
    const theme = localStorage.getItem(Utils.themeKey) || Utils.getThemePreference() || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  },

  toggleTheme() {
    const nextTheme = Utils.getThemePreference() === 'dark' ? 'light' : 'dark';
    Utils.saveThemePreference(nextTheme);
    this.applyTheme();
    if (this.isAuthenticated()) {
      Api.saveSettings({ ...Utils.getSettings(), theme: nextTheme }).catch(() => {});
    }
  },

  setPageMeta(route) {
    const meta = this.pageMeta[route] || this.pageMeta['/'];
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageEyebrow').textContent = meta.eyebrow;
    Router.updateNav(route);
  },

  setAuthLayout(enabled) {
    document.body.classList.toggle('auth-route', enabled);
  },

  refreshUserUI() {
    const user = this.currentUser || Utils.getCurrentUser();
    const initials = Utils.getInitials(user?.fullName);
    const fullName = user?.fullName || 'Guest';
    const email = user?.email || '';

    const avatarNodes = document.querySelectorAll('[data-user-avatar]');
    const nameNodes = document.querySelectorAll('[data-user-name]');
    const emailNodes = document.querySelectorAll('[data-user-email]');
    const logoutNodes = [document.getElementById('userLogout'), document.getElementById('sidebarLogout')].filter(Boolean);

    avatarNodes.forEach((node) => { node.textContent = initials; });
    nameNodes.forEach((node) => { node.textContent = fullName; });
    emailNodes.forEach((node) => { node.textContent = email; });
    logoutNodes.forEach((node) => { node.hidden = !this.isAuthenticated(); });
  },

  completeLogin(response) {
    this.currentUser = response.user;
    Utils.saveAuthToken(response.token);
    Utils.saveCurrentUser(response.user);
    this.historyCache = [];
    this.activityCache = [];
    this.refreshUserUI();
    this.setAuthLayout(false);
    Router.navigate('/');
  },

  async logout() {
    try {
      if (this.isAuthenticated()) {
        await Api.logout();
      }
    } catch (error) {
      // Client-side logout should still proceed.
    }

    this.currentUser = null;
    this.historyCache = [];
    this.activityCache = [];
    Utils.clearSession();
    this.refreshUserUI();
    this.setAuthLayout(true);
    Router.navigate('/login');
  },

  registerRoutes() {
    Router.register('/', () => {
      if (!this.isAuthenticated()) {
        this.setAuthLayout(true);
        Router.navigate('/login');
        return;
      }
      this.setAuthLayout(false);
      this.renderDashboard();
    });
    Router.register('/google-maps', () => {
      if (!this.isAuthenticated()) {
        this.setAuthLayout(true);
        Router.navigate('/login');
        return;
      }
      this.setAuthLayout(false);
      this.setPageMeta('/google-maps');
      GoogleMaps.renderInto(document.getElementById('content'));
    });
    Router.register('/linkedin', () => {
      if (!this.isAuthenticated()) {
        this.setAuthLayout(true);
        Router.navigate('/login');
        return;
      }
      this.setAuthLayout(false);
      this.setPageMeta('/linkedin');
      LinkedIn.renderInto(document.getElementById('content'));
    });
    Router.register('/history', () => {
      if (!this.isAuthenticated()) {
        this.setAuthLayout(true);
        Router.navigate('/login');
        return;
      }
      this.setAuthLayout(false);
      this.renderHistory();
    });
    Router.register('/settings', () => {
      if (!this.isAuthenticated()) {
        this.setAuthLayout(true);
        Router.navigate('/login');
        return;
      }
      this.setAuthLayout(false);
      this.renderSettings();
    });
    Router.register('/login', () => {
      if (this.isAuthenticated()) {
        Router.navigate('/');
        return;
      }
      this.setAuthLayout(true);
      this.setPageMeta('/login');
      Auth.render('login');
    });
    Router.register('/register', () => {
      if (this.isAuthenticated()) {
        Router.navigate('/');
        return;
      }
      this.setAuthLayout(true);
      this.setPageMeta('/register');
      Auth.render('register');
    });
  },

  renderStatusCard(label, active, detail) {
    return `
      <article class="glass-card status-card ${active ? 'configured' : 'not-configured'}">
        <div class="section-head">
          <div>
            <h3>${Utils.escapeHtml(label)}</h3>
            <p>${Utils.escapeHtml(detail)}</p>
          </div>
        </div>
        <div class="status-line">
          <strong>${active ? `${Utils.escapeHtml(label)}: Active ${Utils.icon('check_circle')}` : `Not configured ${Utils.icon('cancel')}`}</strong>
          ${active ? '<span class="status-pill success">Configured</span>' : '<a class="button secondary" href="#/settings">Settings</a>'}
        </div>
      </article>
    `;
  },

  renderSourceCard(source, runs, configured) {
    if (!configured) {
      return this.renderStatusCard(
        source === 'Google Maps' ? 'Google Maps API' : 'LinkedIn API',
        false,
        source === 'Google Maps' ? 'Add a key and enable Google Maps in Settings.' : 'Add a LinkedIn API key in Settings.',
      );
    }

    const totalRows = runs.reduce((sum, item) => sum + (item.count || 0), 0);
    const latest = runs[0];
    return `
      <article class="glass-card status-card configured">
        <div class="section-head">
          <div>
            <h3>${source === 'Google Maps' ? 'Google Maps API' : 'LinkedIn API'}</h3>
            <p>${source === 'Google Maps' ? 'Live Places extraction is available.' : 'Live LinkedIn profile extraction is available.'}</p>
          </div>
        </div>
        <div class="kpi-band compact">
          <article class="stat-card">
            <p class="eyebrow">Status</p>
            <div class="stat-value">Active ${Utils.icon('check_circle')}</div>
            <p class="muted">${source === 'Google Maps' ? 'Places API configured' : 'Apollo.io configured'}</p>
          </article>
          <article class="stat-card">
            <p class="eyebrow">Runs</p>
            <div class="stat-value">${runs.length}</div>
            <p class="muted">Real extraction history only</p>
          </article>
          <article class="stat-card">
            <p class="eyebrow">Rows</p>
            <div class="stat-value">${totalRows}</div>
            <p class="muted">Captured across all runs</p>
          </article>
          <article class="stat-card">
            <p class="eyebrow">Last activity</p>
            <div class="stat-value">${latest ? Utils.relativeTime(latest.timestamp) : 'None'}</div>
            <p class="muted">${latest ? Utils.formatDate(latest.timestamp) : 'No runs yet'}</p>
          </article>
        </div>
      </article>
    `;
  },

  renderRecentExtractions(history) {
    if (!history.length) {
      return '<div class="notice">No real extractions have been recorded yet.</div>';
    }

    return `
      <div class="history-list activity-feed">
        ${history
          .slice(0, 5)
          .map(
            (entry) => `
              <article class="history-item">
                <div class="history-main">
                  <h4>${Utils.escapeHtml(entry.source)}</h4>
                  <p>${entry.count} rows • ${Utils.formatDate(entry.timestamp)} • ${Utils.formatCurrencyInr(entry.cost?.inr || 0)}</p>
                  <p class="history-meta">${Utils.escapeHtml(entry.params?.keyword || entry.params?.query || entry.params?.name || 'Extraction run')}</p>
                </div>
                <div class="inline-actions">
                  <button class="button secondary" data-history-view="${entry.id}">View Results</button>
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    `;
  },

  renderActivityList(activity = []) {
    if (!activity.length) {
      return '<div class="empty-state compact"><h3>No recent activity</h3><p>Logins, searches, and exports will appear here.</p></div>';
    }

    return `
      <div class="history-list">
        ${activity.map((entry) => `
          <article class="history-item compact">
            <div class="history-main">
              <h4>${Utils.escapeHtml(entry.action)}</h4>
              <p>${Utils.formatDate(entry.createdAt)}</p>
              <p class="history-meta">${Utils.escapeHtml(this.describeActivity(entry))}</p>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  },

  describeActivity(entry) {
    const details = entry.details || {};
    if (entry.action === 'search') {
      return `${details.source || 'Extractor'} • ${details.resultCount || 0} rows • ${details.keyword || 'Search'}${details.location ? ` • ${details.location}` : ''}`;
    }
    if (entry.action === 'export') {
      return `${details.format?.toUpperCase() || 'Export'} • ${details.rowCount || 0} rows • ${details.filename || 'download'}`;
    }
    if (entry.action === 'login' || entry.action === 'logout' || entry.action === 'register') {
      return details.email || this.currentUser?.email || 'Account activity';
    }
    return JSON.stringify(details || {});
  },

  async renderDashboard() {
    this.setPageMeta('/');
    const container = document.getElementById('content');
    container.innerHTML = '<section class="glass-card"><div class="notice">Loading live extraction history…</div></section>';

    const [history, activity] = await Promise.all([
      this.loadHistory(true),
      this.loadActivity(true),
    ]);
    const settings = Utils.getSettings();
    const mapsRuns = history.filter((item) => item.source === 'Google Maps');
    const linkedinRuns = history.filter((item) => item.source === 'LinkedIn');
    const totalRecords = history.reduce((sum, item) => sum + (item.count || 0), 0);
    const totalCostInr = history.reduce((sum, item) => sum + Number(item.cost?.inr || 0), 0);
    const avgPerRun = history.length ? Math.round(totalRecords / history.length) : 0;
    const googleConfigured = Utils.isGoogleMapsConfigured(settings);
    const linkedinConfigured = Utils.isLinkedInConfigured(settings);
    const categoryCounts = history.reduce((acc, entry) => {
      const category = entry.params?.category || entry.params?.industry || entry.source;
      const label = String(category || '').replace(/^kw:/i, '').replace(/_/g, ' ').trim();
      if (label) {
        acc[label] = (acc[label] || 0) + 1;
      }
      return acc;
    }, {});
    const topCategory = Object.entries(categoryCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || 'None yet';

    container.innerHTML = `
      <section class="hero-panel">
        <div class="hero-grid">
          <div class="hero-copy">
            <div>
              <p class="eyebrow">Production dashboard</p>
              <h2 class="headline">Track live extraction activity and configuration status across both extractors.</h2>
            </div>
            <p class="lead">All dashboard metrics below are computed from the live server-side extraction history and the current saved settings.</p>
            <div class="hero-actions">
              <a class="button primary" href="#/google-maps">New Google Maps Search</a>
              <a class="button secondary" href="#/linkedin">New LinkedIn Search</a>
              <a class="button secondary" href="#/history">View History</a>
            </div>
          </div>
          <div class="kpi-band">
            <article class="stat-card">
              <p class="eyebrow">Total extractions</p>
              <div class="stat-value">${history.length}</div>
              <p class="muted">Real runs from server memory</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Total records</p>
              <div class="stat-value">${totalRecords}</div>
              <p class="muted">Rows captured across all runs</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Avg / run</p>
              <div class="stat-value">${avgPerRun}</div>
              <p class="muted">Average rows per extraction</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Top category</p>
              <div class="stat-value">${Utils.escapeHtml(topCategory)}</div>
              <p class="muted">Most repeated search theme</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Session spend</p>
              <div class="stat-value">${Utils.escapeHtml(Utils.formatCurrencyInr(totalCostInr))}</div>
              <p class="muted">Across server-side history</p>
            </article>
          </div>
        </div>
      </section>

      <section class="stats-grid">
        ${this.renderSourceCard('Google Maps', mapsRuns, googleConfigured)}
        ${this.renderSourceCard('LinkedIn', linkedinRuns, linkedinConfigured)}
        ${this.renderStatusCard('Google Maps API', googleConfigured, googleConfigured ? 'Places extraction is active.' : 'Add a Google Maps API key in Settings.')}
        ${this.renderStatusCard('LinkedIn API', linkedinConfigured, linkedinConfigured ? 'Apollo.io extraction is active.' : 'Add an Apollo.io API key in Settings.')}
      </section>

      <section class="glass-card">
        <div class="section-head">
          <div>
            <h3>Recent activity</h3>
            <p>Latest extraction events from this session.</p>
          </div>
        </div>
        ${this.renderRecentExtractions(history)}
      </section>

      <section class="glass-card">
        <div class="section-head">
          <div>
            <h3>Activity</h3>
            <p>Last 10 account events.</p>
          </div>
        </div>
        ${this.renderActivityList(activity)}
      </section>
    `;

    container.querySelectorAll('[data-history-view]').forEach((button) => {
      button.addEventListener('click', () => {
        this.historyPreviewId = Number(button.dataset.historyView);
        Router.navigate('/history');
      });
    });
  },

  renderHistoryParams(entry) {
    const params = entry.params || {};
    const items = [];

    if (params.keyword || params.query || params.name) {
      items.push(`Keyword: ${params.keyword || params.query || params.name}`);
    }
    if (params.location) items.push(`Location: ${params.location}`);
    if (params.category) items.push(`Category: ${String(params.category).replace(/^kw:/i, '').replace(/_/g, ' ')}`);
    if (params.radius) items.push(`Radius: ${params.radius}m`);
    if (params.maxResults) items.push(`Max: ${params.maxResults}`);

    return items.map((item) => `<span class="chip">${Utils.escapeHtml(item)}</span>`).join('');
  },

  renderHistoryResultsPreview(entry) {
    const rows = (entry?.results || []).slice(0, 8);
    if (!entry) return '';

    const headers = entry.source === 'Google Maps'
      ? ['Name', 'Address', 'Phone', 'Website']
      : ['Name', 'Headline', 'Company', 'Location'];

    const body = rows
      .map((row) => {
        const cells = entry.source === 'Google Maps'
          ? [row.name, row.address, row.phone, row.website]
          : [row.name, row.headline, row.company, row.location];

        return `<tr>${cells.map((cell) => `<td>${Utils.escapeHtml(cell || '-')}</td>`).join('')}</tr>`;
      })
      .join('');

    return `
      <section class="glass-card history-preview-panel">
        <div class="section-head">
          <div>
            <h3>Stored results preview</h3>
            <p>Showing ${rows.length} of ${entry.count} rows from the saved extraction.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </section>
    `;
  },

  renderHistoryItem(entry) {
    return `
      <article class="history-item">
        <div class="history-main">
          <h4>${Utils.escapeHtml(entry.source)}</h4>
          <p>${entry.count} rows • ${Utils.formatDate(entry.timestamp)} • Cost ${Utils.formatCurrencyInr(entry.cost?.inr || 0)}</p>
          <p class="history-meta">${Utils.escapeHtml(entry.params?.keyword || entry.params?.query || entry.params?.name || 'Saved extraction run')}</p>
          <div class="chip-list compact">${this.renderHistoryParams(entry)}</div>
        </div>
        <div class="inline-actions">
          <button class="button secondary" data-history-rerun="${entry.id}">Re-run</button>
          <button class="button secondary" data-history-view="${entry.id}">View Results</button>
          <button class="button ghost" data-history-export="${entry.id}">Export</button>
          <button class="button danger" data-history-delete="${entry.id}">Delete</button>
        </div>
      </article>
    `;
  },

  async renderHistory() {
    this.setPageMeta('/history');
    const container = document.getElementById('content');
    container.innerHTML = '<section class="glass-card"><div class="notice">Loading live extraction history…</div></section>';

    const history = await this.loadHistory(true);
    const previewEntry = this.getHistoryEntry(this.historyPreviewId);

    container.innerHTML = `
      <section class="hero-panel">
        <div class="hero-grid">
          <div class="hero-copy">
            <div>
              <p class="eyebrow">Saved extractions</p>
              <h2 class="headline">Review earlier runs, reopen result sets, or export again.</h2>
            </div>
            <p class="lead">This view reads the live server-side extraction history for the current session.</p>
          </div>
          <div class="kpi-band">
            <article class="stat-card">
              <p class="eyebrow">Saved runs</p>
              <div class="stat-value">${history.length}</div>
              <p class="muted">Most recent 50 entries retained</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Total spend</p>
              <div class="stat-value">${Utils.escapeHtml(Utils.formatCurrencyInr(history.reduce((sum, item) => sum + Number(item.cost?.inr || 0), 0)))}</div>
              <p class="muted">Computed from extraction history</p>
            </article>
          </div>
        </div>
      </section>
      <section class="glass-card">
        <div class="section-head">
          <div>
            <h3>History list</h3>
            <p>Reopen a result set in the extractor or remove stale runs.</p>
          </div>
        </div>
        ${
          history.length
            ? `<div class="history-list">${history.map((entry) => this.renderHistoryItem(entry)).join('')}</div>`
            : '<div class="empty-state"><h3>No history yet</h3><p>Extraction runs will appear here after you search.</p></div>'
        }
      </section>
      ${previewEntry ? this.renderHistoryResultsPreview(previewEntry) : ''}
    `;

    container.querySelectorAll('[data-history-rerun]').forEach((button) => {
      button.addEventListener('click', () => this.rerunHistoryItem(button.dataset.historyRerun));
    });

    container.querySelectorAll('[data-history-view]').forEach((button) => {
      button.addEventListener('click', () => {
        this.historyPreviewId = Number(button.dataset.historyView);
        this.renderHistory();
      });
    });

    container.querySelectorAll('[data-history-export]').forEach((button) => {
      button.addEventListener('click', () => this.exportHistoryItem(button.dataset.historyExport));
    });

    container.querySelectorAll('[data-history-delete]').forEach((button) => {
      button.addEventListener('click', () => this.deleteHistoryItem(button.dataset.historyDelete));
    });
  },

  getHistoryEntry(entryId) {
    return this.historyCache.find((item) => String(item.id) === String(entryId));
  },

  rerunHistoryItem(entryId) {
    const entry = this.getHistoryEntry(entryId);
    if (!entry) return;

    if (entry.source === 'Google Maps') {
      GoogleMaps.loadSearchFromHistory(entry);
      Router.navigate('/google-maps');
    } else {
      LinkedIn.setHistoryPreview(entry);
      Router.navigate('/linkedin');
    }
  },

  async exportHistoryItem(entryId) {
    const entry = this.getHistoryEntry(entryId);
    if (!entry) return;

    if (entry.source === 'Google Maps') {
      await Export.exportRows({
        data: GoogleMaps.buildExportRows(entry.results || [], GoogleMaps.getVisibleColumns()),
        source: 'google_maps',
        mode: 'all',
        sheetName: 'Google Maps Results',
      });
      return;
    }

    await Export.exportRows({
      data: (entry.results || []).map((row) => ({
        Name: row.name,
        Headline: row.headline,
        Company: row.company,
        Role: row.role,
        Location: row.location,
        Industry: row.industry,
        Followers: row.followerCount,
        ProfileURL: row.profileUrl,
      })),
      source: 'linkedin',
      mode: 'all',
      sheetName: 'LinkedIn Results',
    });
  },

  async deleteHistoryItem(entryId) {
    try {
      await Api.deleteHistoryItem(entryId);
      await this.loadHistory(true);
      Utils.showToast('History entry deleted', 'The saved extraction run was removed.', 'success');
      this.renderHistory();
    } catch (error) {
      Utils.showToast('Delete failed', error.message, 'error');
    }
  },

  renderValidationBadge(serviceKey, settings) {
    const validation = Utils.getValidationState(serviceKey, settings);
    if (validation.status === true) {
      return `<span class="validation-badge valid">${Utils.icon('check_circle')} Valid</span>`;
    }
    if (validation.status === false) {
      return `<span class="validation-badge invalid">${Utils.icon('cancel')} Invalid</span>`;
    }
    return '<span class="validation-badge neutral">Not tested</span>';
  },

  renderValidationTimestamp(serviceKey, settings) {
    const validation = Utils.getValidationState(serviceKey, settings);
    if (!validation.lastValidatedAt) {
      return '<span class="field-hint">Last validated: Never</span>';
    }
    return `<span class="field-hint">Last validated: ${Utils.escapeHtml(Utils.formatDate(validation.lastValidatedAt))}</span>`;
  },

  renderSettings() {
    this.setPageMeta('/settings');
    const settings = Utils.getSettings();
    const savedKeys = [settings.googleMapsApiKey, settings.linkedinApiKey].filter(Boolean).length;

    document.getElementById('content').innerHTML = `
      <section class="hero-panel">
        <div class="hero-grid">
          <div class="hero-copy">
            <div>
              <p class="eyebrow">Persistent configuration</p>
              <h2 class="headline">Store API keys, test connectivity, and control platform availability.</h2>
            </div>
            <p class="lead">Settings persist locally and sync to the server so validation state and extractor availability stay consistent.</p>
          </div>
          <div class="kpi-band">
            <article class="stat-card">
              <p class="eyebrow">Theme</p>
              <div class="stat-value">${settings.theme}</div>
              <p class="muted">Applied across sessions</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Maps enabled</p>
              <div class="stat-value">${settings.googleMapsEnabled ? 'On' : 'Off'}</div>
              <p class="muted">Controls live extraction</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">LinkedIn enabled</p>
              <div class="stat-value">${settings.linkedinEnabled ? 'On' : 'Off'}</div>
              <p class="muted">Controls live extraction</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Saved keys</p>
              <div class="stat-value">${savedKeys}</div>
              <p class="muted">Currently stored locally</p>
            </article>
          </div>
        </div>
      </section>

      <section class="settings-grid">
        <article class="glass-card">
          <div class="section-head">
            <div>
              <h3>Google Maps</h3>
              <p>Live Places API configuration and validation state.</p>
            </div>
            ${this.renderValidationBadge('googleMaps', settings)}
          </div>
          <div class="settings-stack">
            <div class="field">
              <label for="settingsGoogleKey">Google Maps API Key</label>
              <input id="settingsGoogleKey" type="password" value="${Utils.escapeHtml(settings.googleMapsApiKey)}" autocomplete="off">
              <span class="field-hint">Create or manage a key in <a class="link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>.</span>
              ${this.renderValidationTimestamp('googleMaps', settings)}
            </div>
            <div class="toggle-row">
              <div>
                <strong>Enable Google Maps extractor</strong>
                <p class="microcopy">Disables the live search form when turned off.</p>
              </div>
              <button class="toggle ${settings.googleMapsEnabled ? 'active' : ''}" id="settingsGoogleEnabled" type="button"></button>
            </div>
            <div class="inline-actions">
              <button class="button primary" id="saveGoogleSettings">Save Google settings</button>
              <button class="button secondary" id="testGoogleSettings">Test Google key</button>
            </div>
          </div>
        </article>

        <article class="glass-card">
          <div class="section-head">
            <div>
              <h3>LinkedIn</h3>
              <p>Production profile extraction using Apollo.io.</p>
            </div>
            ${this.renderValidationBadge('linkedin', settings)}
          </div>
          <div class="settings-stack">
            <div class="field">
              <label for="settingsLinkedInKey">Apollo.io API Key</label>
              <input id="settingsLinkedInKey" type="password" value="${Utils.escapeHtml(settings.linkedinApiKey)}" autocomplete="off">
              <span class="field-hint">Get your free API key at <a class="link" href="https://app.apollo.io/#/settings/integrations/api" target="_blank" rel="noopener">app.apollo.io → Settings → Integrations → API</a>.</span>
              ${this.renderValidationTimestamp('linkedin', settings)}
            </div>
            <div class="toggle-row">
              <div>
                <strong>Enable LinkedIn extractor</strong>
                <p class="microcopy">Disables the live search form when turned off.</p>
              </div>
              <button class="toggle ${settings.linkedinEnabled ? 'active' : ''}" id="settingsLinkedInEnabled" type="button"></button>
            </div>
            <div class="inline-actions">
              <button class="button primary" id="saveLinkedInSettings">Save LinkedIn settings</button>
              <button class="button secondary" id="testLinkedInSettings">Test LinkedIn key</button>
            </div>
          </div>
        </article>
      </section>

      <section class="glass-card">
        <div class="section-head">
          <div>
            <h3>Data reset</h3>
            <p>Clear local settings if you want a fresh client configuration.</p>
          </div>
        </div>
        <button class="button danger" id="clearLocalData">Clear localStorage data</button>
      </section>
    `;

    this.bindSettingsEvents();
  },

  bindSettingsEvents() {
    document.getElementById('settingsGoogleEnabled')?.addEventListener('click', (event) => {
      event.currentTarget.classList.toggle('active');
    });
    document.getElementById('settingsLinkedInEnabled')?.addEventListener('click', (event) => {
      event.currentTarget.classList.toggle('active');
    });

    document.getElementById('saveGoogleSettings')?.addEventListener('click', () => this.saveSettings('google'));
    document.getElementById('saveLinkedInSettings')?.addEventListener('click', () => this.saveSettings('linkedin'));
    document.getElementById('testGoogleSettings')?.addEventListener('click', () => this.testSettings('google'));
    document.getElementById('testLinkedInSettings')?.addEventListener('click', () => this.testSettings('linkedin'));
    document.getElementById('clearLocalData')?.addEventListener('click', () => {
      const token = Utils.getAuthToken();
      const user = Utils.getCurrentUser();
      Utils.clearAll();
      if (token) Utils.saveAuthToken(token);
      if (user) Utils.saveCurrentUser(user);
      Api.saveSettings(structuredClone(Utils.defaultSettings)).finally(() => {
        Utils.showToast('Local data cleared', 'Settings were reset to defaults.', 'success');
        this.applyTheme();
        this.renderSettings();
      });
    });
  },

  collectSettings() {
    const current = Utils.getSettings();
    const googleMapsApiKey = document.getElementById('settingsGoogleKey').value.trim();
    const linkedinApiKey = document.getElementById('settingsLinkedInKey').value.trim();
    return {
      ...current,
      googleMapsApiKey,
      linkedinApiKey,
      googleMapsEnabled: document.getElementById('settingsGoogleEnabled').classList.contains('active'),
      linkedinEnabled: document.getElementById('settingsLinkedInEnabled').classList.contains('active'),
      validations: {
        ...current.validations,
        googleMaps: googleMapsApiKey === current.googleMapsApiKey
          ? current.validations.googleMaps
          : { status: null, lastValidatedAt: null },
        linkedin: linkedinApiKey === current.linkedinApiKey
          ? current.validations.linkedin
          : { status: null, lastValidatedAt: null },
      },
    };
  },

  async saveSettings(mode) {
    const settings = this.collectSettings();
    Utils.saveSettings(settings);
    this.applyTheme();

    try {
      await Api.saveSettings(settings);
      Utils.showToast('Settings saved', `${mode === 'google' ? 'Google Maps' : 'LinkedIn'} settings persisted locally and on the server.`, 'success');
    } catch (error) {
      Utils.showToast('Saved locally', 'Server sync failed, but localStorage was updated.', 'warning');
    }
  },

  updateValidationState(serviceKey, valid, lastValidatedAt) {
    const settings = Utils.getSettings();
    settings.validations = settings.validations || {};
    settings.validations[serviceKey] = {
      status: valid,
      lastValidatedAt: lastValidatedAt || new Date().toISOString(),
    };
    Utils.saveSettings(settings);
    return settings;
  },

  async testSettings(mode) {
    const settings = this.collectSettings();
    Utils.saveSettings(settings);

    try {
      if (mode === 'google') {
        const result = await Api.validateGoogleApiKey(settings.googleMapsApiKey);
        if (!result.valid) {
          throw new Error(result.error || 'Google validation failed');
        }
        this.updateValidationState('googleMaps', true, result.lastValidatedAt);
        Utils.showToast('Google key verified', 'The proxy successfully reached Google Places.', 'success');
      } else {
        const result = await Api.validateLinkedInApiKey(settings.linkedinApiKey);
        if (!result.valid) {
          throw new Error(result.error || 'LinkedIn validation failed');
        }
        this.updateValidationState('linkedin', true, result.lastValidatedAt);
        Utils.showToast('LinkedIn key verified', result.message || 'The server successfully reached Apollo.io.', 'success');
      }
    } catch (error) {
      this.updateValidationState(mode === 'google' ? 'googleMaps' : 'linkedin', false, new Date().toISOString());
      Utils.showToast('Connection test failed', error.message, 'error');
    } finally {
      this.renderSettings();
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;
