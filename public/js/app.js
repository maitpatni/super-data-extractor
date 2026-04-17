const ProgressModal = {
  modal: null,
  progressFill: null,
  progressText: null,
  progressCount: null,
  progressEta: null,
  total: 0,
  current: 0,
  startTime: null,

  show(text, total = 100) {
    this.modal = document.getElementById('progressModal');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.progressCount = document.getElementById('progressCount');
    this.progressEta = document.getElementById('progressEta');
    
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    
    this.progressText.textContent = text;
    this.progressCount.textContent = `0 / ${total}`;
    this.progressFill.style.width = '0%';
    this.progressEta.textContent = 'Estimated time: calculating...';
    
    this.modal.classList.add('open');
  },

  update(current, text) {
    this.current = current;
    
    if (text) {
      this.progressText.textContent = text;
    }
    
    const percent = Math.round((current / this.total) * 100);
    this.progressFill.style.width = `${percent}%`;
    this.progressCount.textContent = `${current} / ${this.total}`;
    
    const elapsed = Date.now() - this.startTime;
    const estimatedTotal = (elapsed / current) * this.total;
    const remaining = Math.round((estimatedTotal - elapsed) / 1000);
    
    if (remaining > 0) {
      this.progressEta.textContent = `Estimated time: ${remaining}s remaining`;
    }
  },

  hide() {
    if (this.modal) {
      this.modal.classList.remove('open');
    }
  }
};

const App = {
  init() {
    this.loadTheme();
    this.initRouter();
    this.initUI();
    this.setupEventListeners();
  },

  loadTheme() {
    const settings = Utils.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  },

  initRouter() {
    Router.register('/', () => this.renderDashboard());
    Router.register('/google-maps', () => this.renderGoogleMaps());
    Router.register('/linkedin', () => this.renderLinkedIn());
    Router.register('/history', () => this.renderHistory());
    Router.register('/settings', () => this.renderSettings());
    
    Router.init();
  },

  initUI() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const themeToggle = document.getElementById('themeToggle');
    const progressModalClose = document.getElementById('progressModalClose');

    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    if (progressModalClose) {
      progressModalClose.addEventListener('click', () => {
        ProgressModal.hide();
      });
    }

    document.addEventListener('click', (e) => {
      if (e.target === document.querySelector('.modal-backdrop')) {
        ProgressModal.hide();
      }
    });
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', next);
    
    const settings = Utils.getSettings();
    settings.theme = next;
    Utils.saveSettings(settings);
  },

  setupEventListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('open');
        }
      });
    });
  },

  setPageTitle(title) {
    document.getElementById('pageTitle').textContent = title;
  },

  renderDashboard() {
    this.setPageTitle('Dashboard');
    const history = Utils.getHistory();
    
    const googleMapsCount = history.filter(h => h.source === 'Google Maps').length;
    const linkedInCount = history.filter(h => h.source === 'LinkedIn').length;
    const totalExtractions = history.length;
    const totalResults = history.reduce((sum, h) => sum + (h.count || 0), 0);

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="fade-in">
        <div class="dashboard-grid">
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-value">${totalExtractions}</div>
              <div class="stat-label">Total Extractions</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-value">${googleMapsCount}</div>
              <div class="stat-label">Google Maps Extractions</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                <rect x="2" y="9" width="4" height="12"></rect>
                <circle cx="4" cy="4" r="2"></circle>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-value">${linkedInCount}</div>
              <div class="stat-label">LinkedIn Extractions</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-value">${totalResults}</div>
              <div class="stat-label">Total Records Extracted</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Quick Actions</h2>
              <p class="card-subtitle">Start a new data extraction</p>
            </div>
          </div>
          <div class="quick-actions">
            <a href="#/google-maps" class="quick-action">
              <div class="quick-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
              <div class="quick-action-text">
                <h4>Google Maps</h4>
                <p>Extract business listings</p>
              </div>
            </a>
            <a href="#/linkedin" class="quick-action">
              <div class="quick-action-icon" style="background: var(--accent-purple);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                  <rect x="2" y="9" width="4" height="12"></rect>
                  <circle cx="4" cy="4" r="2"></circle>
                </svg>
              </div>
              <div class="quick-action-text">
                <h4>LinkedIn</h4>
                <p>Search profiles</p>
              </div>
            </a>
            <a href="#/history" class="quick-action">
              <div class="quick-action-icon" style="background: var(--accent-success);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div class="quick-action-text">
                <h4>History</h4>
                <p>View past extractions</p>
              </div>
            </a>
            <a href="#/settings" class="quick-action">
              <div class="quick-action-icon" style="background: var(--accent-warning);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </div>
              <div class="quick-action-text">
                <h4>Settings</h4>
                <p>Configure API keys</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    `;
  },

  renderGoogleMaps() {
    this.setPageTitle('Google Maps Extractor');
    
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="fade-in slide-up">
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Search Businesses</h2>
              <p class="card-subtitle">Extract business data from Google Maps Places API</p>
            </div>
          </div>
          <div id="gmForm">
            ${GoogleMaps.renderSearchForm()}
          </div>
        </div>
        <div style="margin-top: 24px;" id="gmResults">
          ${GoogleMaps.renderResultsTable()}
        </div>
      </div>
    `;
    
    GoogleMaps.setupEventListeners();
  },

  renderLinkedIn() {
    this.setPageTitle('LinkedIn Extractor');
    
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="fade-in slide-up">
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Search Profiles</h2>
              <p class="card-subtitle">Find professional profiles on LinkedIn</p>
            </div>
          </div>
          <div id="liForm">
            ${LinkedIn.renderSearchForm()}
          </div>
        </div>
        <div style="margin-top: 24px;" id="liResults">
          ${LinkedIn.renderResultsTable()}
        </div>
      </div>
    `;
    
    LinkedIn.setupEventListeners();
  },

  renderHistory() {
    this.setPageTitle('Extraction History');
    const history = Utils.getHistory();

    if (history.length === 0) {
      document.getElementById('content').innerHTML = `
        <div class="fade-in">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <h3>No History Yet</h3>
            <p>Your extraction history will appear here</p>
            <a href="#/google-maps" class="btn btn-primary">Start Extraction</a>
          </div>
        </div>
      `;
      return;
    }

    const historyItems = history.map(item => {
      const isGoogle = item.source === 'Google Maps';
      return `
        <div class="history-item">
          <div class="history-icon ${isGoogle ? 'google' : 'linkedin'}">
            ${isGoogle ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            ` : `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                <rect x="2" y="9" width="4" height="12"></rect>
                <circle cx="4" cy="4" r="2"></circle>
              </svg>
            `}
          </div>
          <div class="history-content">
            <div class="history-source">${item.source}</div>
            <div class="history-meta">
              ${Utils.formatDate(item.timestamp)} • ${item.count || 0} records
            </div>
          </div>
          <div class="history-count">${item.count || 0}</div>
          <div class="history-actions">
            <button class="table-action-btn" data-view="${item.id}" title="View Results">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button class="table-action-btn" data-export="${item.id}" title="Export">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="table-action-btn" data-delete="${item.id}" title="Delete" style="color: var(--accent-error);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('content').innerHTML = `
      <div class="fade-in">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Extraction History</h2>
            <span style="color: var(--text-secondary);">${history.length} extractions</span>
          </div>
          <div class="history-list">
            ${historyItems}
          </div>
        </div>
      </div>
    `;

    this.setupHistoryActions();
  },

  setupHistoryActions() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.view);
        this.viewHistoryItem(id);
      });
    });

    document.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.export);
        this.exportHistoryItem(id);
      });
    });

    document.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.delete);
        this.deleteHistoryItem(id);
      });
    });
  },

  viewHistoryItem(id) {
    const history = Utils.getHistory();
    const item = history.find(h => h.id === id);
    
    if (!item || !item.results) return;

    if (item.source === 'Google Maps') {
      GoogleMaps.currentResults = item.results;
      Router.navigate('/google-maps');
      setTimeout(() => {
        document.getElementById('content').innerHTML = `
          <div class="fade-in slide-up">
            <div class="card">
              <div class="card-header">
                <div>
                  <h2 class="card-title">Viewing: ${item.source}</h2>
                  <p class="card-subtitle">${Utils.formatDate(item.timestamp)} • ${item.results.length} records</p>
                </div>
                <button class="btn btn-ghost" onclick="Router.navigate('/history')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div style="margin-top: 24px;">
              ${GoogleMaps.renderResultsTable()}
            </div>
          </div>
        `;
        GoogleMaps.setupEventListeners();
      }, 100);
    } else {
      LinkedIn.currentResults = item.results;
      Router.navigate('/linkedin');
      setTimeout(() => {
        document.getElementById('content').innerHTML = `
          <div class="fade-in slide-up">
            <div class="card">
              <div class="card-header">
                <div>
                  <h2 class="card-title">Viewing: ${item.source}</h2>
                  <p class="card-subtitle">${Utils.formatDate(item.timestamp)} • ${item.results.length} records</p>
                </div>
                <button class="btn btn-ghost" onclick="Router.navigate('/history')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div style="margin-top: 24px;">
              ${LinkedIn.renderResultsTable()}
            </div>
          </div>
        `;
        LinkedIn.setupEventListeners();
      }, 100);
    }
  },

  exportHistoryItem(id) {
    const history = Utils.getHistory();
    const item = history.find(h => h.id === id);
    
    if (!item || !item.results) return;

    if (item.source === 'Google Maps') {
      Export.exportGoogleMapsResults(item.results);
    } else {
      Export.exportLinkedInResults(item.results);
    }
  },

  deleteHistoryItem(id) {
    let history = Utils.getHistory();
    history = history.filter(h => h.id !== id);
    Utils.saveHistory(history);
    Utils.showToast('History item deleted', 'success');
    this.renderHistory();
  },

  renderSettings() {
    this.setPageTitle('Settings');
    const settings = Utils.getSettings();
    
    document.getElementById('content').innerHTML = `
      <div class="fade-in">
        <div class="card">
          <div class="settings-section">
            <h3 class="settings-section-title">API Keys</h3>
            
            <div class="form-group">
              <label class="form-label">Google Maps API Key</label>
              <div class="api-key-input">
                <input type="password" class="form-input" id="googleMapsApiKey" value="${settings.googleMapsApiKey || ''}" placeholder="Enter your Google Maps API key">
                <button class="toggle-visibility" data-target="googleMapsApiKey">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
              <p class="form-hint">Get your API key from <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noopener">Google Cloud Console</a></p>
            </div>

            <div class="form-group">
              <label class="form-label">LinkedIn API Key (Optional)</label>
              <div class="api-key-input">
                <input type="password" class="form-input" id="linkedinApiKey" value="${settings.linkedinApiKey || ''}" placeholder="Enter your LinkedIn API credentials">
                <button class="toggle-visibility" data-target="linkedinApiKey">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
            </div>

            <button class="btn btn-secondary" id="validateApiKeys">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              Validate API Keys
            </button>
          </div>

          <div class="settings-section">
            <h3 class="settings-section-title">Platform Settings</h3>
            
            <div class="settings-toggle">
              <div class="toggle-info">
                <h4>Google Maps</h4>
                <p>Enable Google Maps extraction</p>
              </div>
              <div class="toggle-switch ${settings.googleMapsEnabled ? 'active' : ''}" id="gmEnabled" data-enabled="${settings.googleMapsEnabled !== false}"></div>
            </div>

            <div class="settings-toggle">
              <div class="toggle-info">
                <h4>LinkedIn</h4>
                <p>Enable LinkedIn extraction</p>
              </div>
              <div class="toggle-switch ${settings.linkedinEnabled ? 'active' : ''}" id="liEnabled" data-enabled="${settings.linkedinEnabled !== false}"></div>
            </div>
          </div>

          <div class="btn-group">
            <button class="btn btn-primary" id="saveSettings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Save Settings
            </button>
            <button class="btn btn-ghost" id="clearData">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Clear All Data
            </button>
          </div>
        </div>
      </div>
    `;

    this.setupSettingsListeners();
  },

  setupSettingsListeners() {
    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveSettings());
    }

    const clearBtn = document.getElementById('clearData');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllData());
    }

    const validateBtn = document.getElementById('validateApiKeys');
    if (validateBtn) {
      validateBtn.addEventListener('click', () => this.validateApiKeys());
    }

    const toggles = document.querySelectorAll('.toggle-switch');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const isEnabled = toggle.dataset.enabled === 'true';
        toggle.dataset.enabled = !isEnabled;
        toggle.classList.toggle('active', !isEnabled);
      });
    });

    const visibilityBtns = document.querySelectorAll('.toggle-visibility');
    visibilityBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) {
          target.type = target.type === 'password' ? 'text' : 'password';
        }
      });
    });
  },

  async saveSettings() {
    const googleMapsApiKey = document.getElementById('googleMapsApiKey')?.value?.trim();
    const linkedinApiKey = document.getElementById('linkedinApiKey')?.value?.trim();
    const gmEnabled = document.getElementById('gmEnabled')?.dataset.enabled === 'true';
    const liEnabled = document.getElementById('liEnabled')?.dataset.enabled === 'true';

    const settings = Utils.getSettings();
    settings.googleMapsApiKey = googleMapsApiKey || '';
    settings.linkedinApiKey = linkedinApiKey || '';
    settings.googleMapsEnabled = gmEnabled;
    settings.linkedinEnabled = liEnabled;

    Utils.saveSettings(settings);
    
    try {
      await Api.saveSettings(settings);
      Utils.showToast('Settings saved successfully', 'success');
    } catch (error) {
      Utils.showToast('Settings saved locally', 'success');
    }
  },

  async validateApiKeys() {
    const apiKey = document.getElementById('googleMapsApiKey')?.value?.trim();
    
    if (!apiKey) {
      Utils.showToast('Please enter a Google Maps API key', 'error');
      return;
    }

    const btn = document.getElementById('validateApiKeys');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Validating...';

    try {
      const result = await Api.validateGoogleApiKey(apiKey);
      
      if (result.valid) {
        Utils.showToast('API key is valid', 'success');
      } else {
        Utils.showToast('API key is invalid: ' + result.error, 'error');
      }
    } catch (error) {
      Utils.showToast('Validation failed: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        Validate API Keys
      `;
    }
  },

  clearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      localStorage.removeItem('dataExtractorSettings');
      localStorage.removeItem('dataExtractorHistory');
      Utils.showToast('All data cleared', 'success');
      this.renderSettings();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});