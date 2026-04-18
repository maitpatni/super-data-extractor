const LinkedIn = {
  currentResults: [],
  selectedIds: new Set(),
  lastRun: null,
  isLoading: false,
  configNotice: '',
  formState: {
    name: '',
    company: '',
    role: '',
    location: '',
    industry: '',
    maxResults: 10,
  },
  postFilters: {
    search: '',
  },
  sortState: {
    key: 'name',
    direction: 'asc',
  },

  columns: [
    ['name', 'Name'],
    ['headline', 'Headline'],
    ['company', 'Company'],
    ['role', 'Role'],
    ['location', 'Location'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['industry', 'Industry'],
    ['followerCount', 'Followers'],
    ['profileUrl', 'Profile'],
  ],

  getFilteredResults() {
    const search = this.postFilters.search.trim().toLowerCase();
    const filtered = this.currentResults.filter((row) => {
      if (!search) return true;

      const haystack = [
        row.name,
        row.headline,
        row.company,
        row.role,
        row.location,
        row.email,
        row.phone,
        row.industry,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });

    const { key, direction } = this.sortState;
    filtered.sort((a, b) => {
      const left = key === 'followerCount' ? Number(a[key] || 0) : String(a[key] ?? '').toLowerCase();
      const right = key === 'followerCount' ? Number(b[key] || 0) : String(b[key] ?? '').toLowerCase();
      const result = left > right ? 1 : left < right ? -1 : 0;
      return direction === 'asc' ? result : -result;
    });

    return filtered;
  },

  setHistoryPreview(entry) {
    this.currentResults = entry.results || [];
    this.lastRun = entry;
    this.selectedIds = new Set();
    this.postFilters = { search: '' };
    this.configNotice = '';
  },

  renderConfigState(settings) {
    if (settings.linkedinApiKey) return '';

    return `
      <article class="glass-card">
        <div class="section-head">
          <div>
            <h3>Apollo.io API key required</h3>
            <p>Configure Apollo.io before running LinkedIn profile extraction.</p>
          </div>
        </div>
        <div class="results-note">
          Configure API key in Settings to use this feature.
        </div>
        <div class="inline-actions">
          <a class="button primary" href="#/settings">Open Settings</a>
        </div>
      </article>
    `;
  },

  renderNotice() {
    if (!this.configNotice) return '';

    return `
      <article class="glass-card">
        <div class="results-note">${Utils.escapeHtml(this.configNotice)}</div>
        <div class="inline-actions">
          <a class="button primary" href="#/settings">Go to Settings</a>
        </div>
      </article>
    `;
  },

  renderPage() {
    const settings = Utils.getSettings();
    const results = this.getFilteredResults();
    const selectedCount = results.filter((row) => this.selectedIds.has(row.id)).length;

    return `
      <section class="hero-panel">
        <div class="hero-grid">
          <div class="hero-copy">
            <div class="hero-title-stack">
              <p class="eyebrow page-badge">${App.renderBrandIcon('linkedin')}LinkedIn extraction</p>
              <h2 class="headline">Search real LinkedIn profiles through your configured Apollo.io key.</h2>
            </div>
            <p class="lead">
              Use structured filters, review live profile matches, and export selected rows to Excel from the same workspace.
            </p>
            <div class="chip-list">
              <span class="chip">${settings.linkedinEnabled ? 'LinkedIn extractor enabled' : 'LinkedIn extractor disabled'}</span>
              <span class="chip">${settings.linkedinApiKey ? 'Apollo.io key configured' : 'Apollo.io key required'}</span>
            </div>
          </div>
          <div class="kpi-band">
            <article class="stat-card">
              <p class="eyebrow">Visible profiles</p>
              <div class="stat-value">${results.length}</div>
              <p class="muted">After current filters</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Selected</p>
              <div class="stat-value">${selectedCount}</div>
              <p class="muted">Marked for export</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">API key</p>
              <div class="stat-value">${settings.linkedinApiKey ? 'Ready' : 'Missing'}</div>
              <p class="muted">Stored locally and on the server</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Last run</p>
              <div class="stat-value">${this.lastRun ? Utils.relativeTime(this.lastRun.timestamp) : 'None'}</div>
              <p class="muted">${this.lastRun ? `${this.lastRun.count} profiles returned` : 'Run a search to begin'}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="extractor-layout">
        <article class="glass-card">
          <div class="section-head">
            <div>
              <h3>Profile search form</h3>
              <p>Search by person, company, role, location, and industry.</p>
            </div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label for="liName">Name</label>
              <input id="liName" type="text" value="${Utils.escapeHtml(this.formState.name)}" placeholder="Ava Patel">
            </div>
            <div class="field">
              <label for="liCompany">Company</label>
              <input id="liCompany" type="text" value="${Utils.escapeHtml(this.formState.company)}" placeholder="Northstar Labs">
            </div>
            <div class="field">
              <label for="liRole">Role</label>
              <input id="liRole" type="text" value="${Utils.escapeHtml(this.formState.role)}" placeholder="Head of Growth">
            </div>
            <div class="field">
              <label for="liLocation">Location</label>
              <input id="liLocation" type="text" value="${Utils.escapeHtml(this.formState.location)}" placeholder="Bengaluru">
            </div>
            <div class="field">
              <label for="liIndustry">Industry</label>
              <input id="liIndustry" type="text" value="${Utils.escapeHtml(this.formState.industry)}" placeholder="SaaS">
            </div>
            <div class="field">
              <label for="liMaxResults">Max results</label>
              <select id="liMaxResults">
                <option value="5" ${Number(this.formState.maxResults) === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${Number(this.formState.maxResults) === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${Number(this.formState.maxResults) === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${Number(this.formState.maxResults) === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${Number(this.formState.maxResults) === 100 ? 'selected' : ''}>100</option>
              </select>
            </div>
          </div>
          <div class="form-actions">
            <button class="button primary" id="liRunSearch" ${this.isLoading ? 'disabled' : ''}>${this.isLoading ? 'Loading profiles…' : 'Run LinkedIn extraction'}</button>
            <button class="button secondary" id="liResetForm" ${this.isLoading ? 'disabled' : ''}>Reset form</button>
          </div>
        </article>

        ${this.renderConfigState(settings)}
        ${this.renderNotice()}
      </section>

      <section class="table-card">
        <div class="section-head">
          <div>
            <h3>Results workspace</h3>
            <p>${results.length} rows visible, ${selectedCount} selected.</p>
          </div>
        </div>
        ${this.renderControls(results)}
        ${this.renderResultsTable(results)}
      </section>
    `;
  },

  renderControls(results) {
    return `
      <div class="results-toolbar">
        <div class="filter-bar">
          <div class="field-grid">
            <div class="field">
              <label for="liPostSearch">Search rows</label>
              <input id="liPostSearch" type="text" value="${Utils.escapeHtml(this.postFilters.search)}" placeholder="Search by name, company, role">
            </div>
            <div class="field">
              <label for="liSheetName">Sheet name</label>
              <input id="liSheetName" type="text" value="LinkedIn Results" maxlength="31">
            </div>
          </div>
        </div>

        <div class="toolbar-actions">
          <button class="button secondary" id="liExportSelected" ${results.length ? '' : 'disabled'}>Export selected</button>
          <button class="button success" id="liExportAll" ${results.length ? '' : 'disabled'}>Export all</button>
        </div>
      </div>
    `;
  },

  renderResultsTable(results) {
    if (!results.length) {
      return `
        <div class="empty-state">
          <p class="eyebrow">No rows</p>
          <h3>No LinkedIn profiles loaded</h3>
          <p>Run a LinkedIn search to populate the results table.</p>
        </div>
      `;
    }

    const headers = this.columns
      .map(([key, label]) => {
        const active = this.sortState.key === key;
        const indicator = active
          ? Utils.icon(this.sortState.direction === 'asc' ? 'arrow_upward' : 'arrow_downward')
          : Utils.icon('unfold_more');
        return `<th class="sortable ${active ? 'active' : ''}" data-li-sort="${key}">${label}<span class="sort-indicator">${indicator}</span></th>`;
      })
      .join('');

    const rows = results
      .map((row) => `
        <tr>
          <td><input class="table-checkbox" type="checkbox" data-li-row="${row.id}" ${this.selectedIds.has(row.id) ? 'checked' : ''}></td>
          <td>${Utils.escapeHtml(row.name)}</td>
          <td>${Utils.escapeHtml(row.headline)}</td>
          <td>${Utils.escapeHtml(row.company)}</td>
          <td>${Utils.escapeHtml(row.role)}</td>
          <td>${Utils.escapeHtml(row.location)}</td>
          <td>${row.email ? `<a class="link" href="mailto:${Utils.escapeHtml(row.email)}">${Utils.escapeHtml(row.email)}</a>` : '-'}</td>
          <td>${Utils.escapeHtml(row.phone || '-')}</td>
          <td>${Utils.escapeHtml(row.industry)}</td>
          <td>${Utils.formatNumber(row.followerCount)}</td>
          <td>${row.profileUrl ? `<a class="link" href="${Utils.escapeHtml(row.profileUrl)}" target="_blank" rel="noopener">Open</a>` : '-'}</td>
        </tr>
      `)
      .join('');

    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th><input class="table-checkbox" id="liSelectAll" type="checkbox" ${results.every((row) => this.selectedIds.has(row.id)) ? 'checked' : ''}></th>
              ${headers}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  exportConfig(selectedOnly, sheetName) {
    const rows = selectedOnly ? Utils.pickExportRows(this.getFilteredResults(), this.selectedIds) : this.getFilteredResults();
    return {
      data: rows.map((row) => ({
        Name: row.name,
        Headline: row.headline,
        Company: row.company,
        Role: row.role,
        Location: row.location,
        Email: row.email,
        Phone: row.phone,
        Industry: row.industry,
        Followers: row.followerCount,
        ProfileURL: row.profileUrl,
      })),
      source: 'linkedin',
      mode: selectedOnly ? 'selected' : 'all',
      sheetName: sheetName || 'LinkedIn Results',
    };
  },

  syncFormState() {
    this.formState = {
      name: document.getElementById('liName').value.trim(),
      company: document.getElementById('liCompany').value.trim(),
      role: document.getElementById('liRole').value.trim(),
      location: document.getElementById('liLocation').value.trim(),
      industry: document.getElementById('liIndustry').value.trim(),
      maxResults: Number(document.getElementById('liMaxResults').value) || 10,
    };
  },

  setupEventListeners() {
    document.getElementById('liRunSearch')?.addEventListener('click', () => this.startExtraction());
    document.getElementById('liResetForm')?.addEventListener('click', () => {
      this.formState = { name: '', company: '', role: '', location: '', industry: '', maxResults: 10 };
      this.postFilters = { search: '' };
      this.configNotice = '';
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('liPostSearch')?.addEventListener('input', (event) => {
      this.postFilters.search = event.target.value;
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('liExportSelected')?.addEventListener('click', async () => {
      const sheetName = document.getElementById('liSheetName')?.value.trim();
      await Export.exportRows(this.exportConfig(true, sheetName));
    });

    document.getElementById('liExportAll')?.addEventListener('click', async () => {
      const sheetName = document.getElementById('liSheetName')?.value.trim();
      await Export.exportRows(this.exportConfig(false, sheetName));
    });

    document.querySelectorAll('[data-li-sort]').forEach((header) => {
      header.addEventListener('click', () => {
        const key = header.dataset.liSort;
        if (this.sortState.key === key) {
          this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortState = { key, direction: 'asc' };
        }
        this.renderInto(document.getElementById('content'));
      });
    });

    document.getElementById('liSelectAll')?.addEventListener('change', (event) => {
      const rows = this.getFilteredResults();
      if (event.target.checked) {
        rows.forEach((row) => this.selectedIds.add(row.id));
      } else {
        rows.forEach((row) => this.selectedIds.delete(row.id));
      }
      this.renderInto(document.getElementById('content'));
    });

    document.querySelectorAll('[data-li-row]').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const rowId = event.target.dataset.liRow;
        if (event.target.checked) {
          this.selectedIds.add(rowId);
        } else {
          this.selectedIds.delete(rowId);
        }
        this.renderInto(document.getElementById('content'));
      });
    });
  },

  async startExtraction() {
    const settings = Utils.getSettings();
    if (!settings.linkedinEnabled) {
      Utils.showToast('LinkedIn is disabled', 'Enable the platform from Settings first.', 'error');
      return;
    }

    this.syncFormState();
    this.configNotice = '';

    if (!Object.values(this.formState).some((value) => value && value !== 10)) {
      Utils.showToast('Missing search criteria', 'Enter at least one LinkedIn search field.', 'error');
      return;
    }

    this.isLoading = true;
    this.renderInto(document.getElementById('content'));

    App.Progress.start('LinkedIn extraction', 10, 'Submitting LinkedIn search');
    const pulse = window.setInterval(() => {
      App.Progress.tick('Waiting for live profile results');
    }, 500);

    try {
      const response = await Api.searchLinkedIn(this.formState);
      this.currentResults = response.results || [];
      this.lastRun = response.extraction || {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        source: 'LinkedIn',
        count: this.currentResults.length,
        params: this.formState,
        results: this.currentResults,
      };
      this.selectedIds = new Set();
      App.loadHistory(true).catch(() => {});
      App.Progress.finish(this.currentResults.length || 1, `Loaded ${this.currentResults.length} profile rows`);
      Utils.showToast('LinkedIn search complete', `${this.currentResults.length} live profiles matched.`, 'success');
    } catch (error) {
      App.Progress.stop();

      if (error.configRequired) {
        this.currentResults = [];
        this.selectedIds = new Set();
        this.configNotice = 'Apollo.io API key required. Go to Settings → Apollo.io API Key to configure.';
        Utils.showToast('Apollo.io API key required', 'Go to Settings to add your Apollo.io key.', 'warning');
      } else {
        Utils.showToast('LinkedIn extraction failed', error.message, 'error');
      }
    } finally {
      window.clearInterval(pulse);
      this.isLoading = false;
      this.renderInto(document.getElementById('content'));
    }
  },

  renderInto(container) {
    if (!container) return;
    container.innerHTML = this.renderPage();
    this.setupEventListeners();
  },
};

window.LinkedIn = LinkedIn;
