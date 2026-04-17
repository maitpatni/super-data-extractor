const LinkedIn = {
  currentResults: [],
  isExtracting: false,

  async extract(params) {
    this.isExtracting = true;

    try {
      const response = await Api.searchLinkedIn(params);
      
      if (response.results) {
        this.currentResults = response.results;
        
        const history = Utils.getHistory();
        history.unshift({
          id: Date.now(),
          source: 'LinkedIn',
          count: response.results.length,
          timestamp: new Date().toISOString(),
          results: response.results,
          params
        });
        
        if (history.length > 50) history.pop();
        Utils.saveHistory(history);
      }

      return response;
    } catch (error) {
      throw error;
    } finally {
      this.isExtracting = false;
    }
  },

  renderSearchForm() {
    return `
      <div class="filters-section">
        <div class="filters-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          Search Parameters
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="liName" placeholder="e.g., John Smith">
          </div>
          <div class="form-group">
            <label class="form-label">Company</label>
            <input type="text" class="form-input" id="liCompany" placeholder="e.g., Google, Meta, Apple">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Role / Title</label>
            <input type="text" class="form-input" id="liRole" placeholder="e.g., Software Engineer">
          </div>
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" class="form-input" id="liLocation" placeholder="e.g., San Francisco, CA">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Industry</label>
          <input type="text" class="form-input" id="liIndustry" placeholder="e.g., Technology, Finance">
        </div>
      </div>

      <button class="btn btn-primary btn-lg" id="liExtractBtn" style="width: 100%;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Start Extraction
      </button>

      <div class="card" style="margin-top: 24px; background: var(--bg-secondary); border-color: var(--border);">
        <div style="display: flex; align-items: center; gap: 12px; color: var(--accent-warning);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span style="font-weight: 600;">Note</span>
        </div>
        <p style="margin-top: 12px; font-size: 13px; color: var(--text-secondary);">
          LinkedIn API access is restricted. This demo uses sample data to demonstrate the extraction functionality.
          In production, you would need LinkedIn's official API access or web scraping solutions.
        </p>
      </div>
    `;
  },

  renderResultsTable() {
    if (this.currentResults.length === 0) {
      return `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
            <rect x="2" y="9" width="4" height="12"></rect>
            <circle cx="4" cy="4" r="2"></circle>
          </svg>
          <h3>No Results Yet</h3>
          <p>Run a search to extract profile data from LinkedIn</p>
        </div>
      `;
    }

    const rows = this.currentResults.map((result, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${Utils.escapeHtml(result.name || '-')}</td>
        <td>${Utils.escapeHtml(result.headline || '-')}</td>
        <td>${Utils.escapeHtml(result.company || '-')}</td>
        <td>${Utils.escapeHtml(result.jobTitle || '-')}</td>
        <td>${Utils.escapeHtml(result.location || '-')}</td>
        <td>${result.connectionDegree || '-'}</td>
        <td>${result.profileUrl ? `<a href="${result.profileUrl}" target="_blank" rel="noopener">View</a>` : '-'}</td>
      </tr>
    `).join('');

    return `
      <div class="results-info">
        <span class="results-count"><strong>${this.currentResults.length}</strong> results found</span>
        <button class="btn btn-success" id="liExportBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export to Excel
        </button>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Headline</th>
              <th>Company</th>
              <th>Job Title</th>
              <th>Location</th>
              <th>Connection</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  setupEventListeners() {
    const extractBtn = document.getElementById('liExtractBtn');
    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.startExtraction());
    }

    const exportBtn = document.getElementById('liExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        Export.exportLinkedInResults(this.currentResults);
      });
    }
  },

  async startExtraction() {
    const name = document.getElementById('liName')?.value?.trim();
    const company = document.getElementById('liCompany')?.value?.trim();
    const role = document.getElementById('liRole')?.value?.trim();
    const location = document.getElementById('liLocation')?.value?.trim();
    const industry = document.getElementById('liIndustry')?.value?.trim();

    const params = { name, company, role, location, industry };

    if (!name && !company && !role && !location && !industry) {
      Utils.showToast('Please enter at least one search parameter', 'error');
      return;
    }

    try {
      ProgressModal.show('Searching LinkedIn...', 15);
      
      const response = await this.extract(params);
      
      ProgressModal.hide();
      
      if (response.results) {
        this.currentResults = response.results;
        Utils.showToast(`Found ${response.results.length} profiles`, 'success');
        this.renderResults();
      }
    } catch (error) {
      ProgressModal.hide();
      Utils.showToast(error.message, 'error');
    }
  },

  renderResults() {
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = this.renderResultsTable();
      this.setupEventListeners();
    }
  }
};

window.LinkedIn = LinkedIn;