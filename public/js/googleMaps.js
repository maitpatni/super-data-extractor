const GoogleMaps = {
  currentResults: [],
  isExtracting: false,

  async extract(params) {
    this.isExtracting = true;
    const settings = Utils.getSettings();
    
    const searchParams = {
      keyword: params.keyword,
      location: params.location,
      radius: params.radius || 5000,
      category: params.category || '',
      maxResults: params.maxResults || 20,
      filters: params.filters,
      apiKey: settings.googleMapsApiKey
    };

    try {
      const response = await Api.searchGoogleMaps(searchParams);
      
      if (response.results) {
        this.currentResults = response.results;
        
        const history = Utils.getHistory();
        history.unshift({
          id: Date.now(),
          source: 'Google Maps',
          count: response.results.length,
          timestamp: new Date().toISOString(),
          results: response.results,
          params: searchParams
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
            <label class="form-label required">Keyword</label>
            <input type="text" class="form-input" id="gmKeyword" placeholder="e.g., restaurants, plumbers, hotels">
          </div>
          <div class="form-group">
            <label class="form-label required">Location</label>
            <input type="text" class="form-input" id="gmLocation" placeholder="e.g., New York, NY or 10001">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="gmCategory">
              <option value="">All Categories</option>
              <option value="restaurant">Restaurants</option>
              <option value="cafe">Cafes</option>
              <option value="bar">Bars</option>
              <option value="hotel">Hotels</option>
              <option value="store">Stores</option>
              <option value="gym">Gyms</option>
              <option value="school">Schools</option>
              <option value="hospital">Hospitals</option>
              <option value="bank">Banks</option>
              <option value="atm">ATMs</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Max Results</label>
            <input type="number" class="form-input" id="gmMaxResults" value="20" min="1" max="60">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Radius (meters)</label>
          <input type="number" class="form-input" id="gmRadius" value="5000" min="100" max="50000" step="100">
        </div>
      </div>

      <div class="filters-section">
        <div class="filters-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          Pre-Extraction Filters
        </div>
        <div class="filters-grid">
          <div class="checkbox-group">
            <div class="checkbox" id="gmFilterPhone" data-checked="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <label class="checkbox-label">Has Phone Number</label>
          </div>
          <div class="checkbox-group">
            <div class="checkbox" id="gmFilterWebsite" data-checked="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <label class="checkbox-label">Has Website</label>
          </div>
          <div class="checkbox-group">
            <div class="checkbox" id="gmFilterReviews" data-checked="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <label class="checkbox-label">Has Reviews</label>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Minimum Rating</label>
            <div class="range-group">
              <input type="range" class="range-slider" id="gmMinRating" min="0" max="5" step="0.5" value="0">
              <span class="range-value" id="gmMinRatingValue">0</span>
            </div>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-lg" id="gmExtractBtn" style="width: 100%;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Start Extraction
      </button>
    `;
  },

  renderResultsTable() {
    if (this.currentResults.length === 0) {
      return `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h3>No Results Yet</h3>
          <p>Run a search to extract business data from Google Maps</p>
        </div>
      `;
    }

    const rows = this.currentResults.map((result, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${Utils.escapeHtml(result.name || '-')}</td>
        <td>${Utils.escapeHtml(result.address || '-')}</td>
        <td>${Utils.escapeHtml(result.phone || '-')}</td>
        <td>${result.website ? `<a href="${result.website}" target="_blank"rel="noopener">Website</a>` : '-'}</td>
        <td>${this.renderRating(result.rating)}</td>
        <td>${result.reviews || '-'}</td>
        <td>${Utils.escapeHtml(result.category || '-')}</td>
      </tr>
    `).join('');

    return `
      <div class="results-info">
        <span class="results-count"><strong>${this.currentResults.length}</strong> results found</span>
        <button class="btn btn-success" id="gmExportBtn">
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
              <th>Address</th>
              <th>Phone</th>
              <th>Website</th>
              <th>Rating</th>
              <th>Reviews</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  renderRating(rating) {
    if (!rating) return '-';
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars += `<svg class="rating-star" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
      } else if (i === fullStars && hasHalf) {
        stars += `<svg class="rating-star" viewBox="0 0 24 24" fill="currentColor" stroke="none"><defs><linearGradient id="half${i}"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path fill="url(#half${i})" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
      } else {
        stars += `<svg class="rating-star empty" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
      }
    }
    
    return `<div class="rating">${stars}<span>${rating.toFixed(1)}</span></div>`;
  },

  setupEventListeners() {
    const checkboxes = document.querySelectorAll('#gmFilters .checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('click', () => {
        const isChecked = checkbox.dataset.checked === 'true';
        checkbox.dataset.checked = !isChecked;
        checkbox.classList.toggle('checked', !isChecked);
      });
    });

    const ratingSlider = document.getElementById('gmMinRating');
    const ratingValue = document.getElementById('gmMinRatingValue');
    if (ratingSlider && ratingValue) {
      ratingSlider.addEventListener('input', () => {
        ratingValue.textContent = ratingSlider.value;
      });
    }

    const extractBtn = document.getElementById('gmExtractBtn');
    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.startExtraction());
    }

    const exportBtn = document.getElementById('gmExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        Export.exportGoogleMapsResults(this.currentResults);
      });
    }
  },

  async startExtraction() {
    const settings = Utils.getSettings();
    
    if (!settings.googleMapsApiKey) {
      Utils.showToast('Please configure Google Maps API key in Settings', 'error');
      Router.navigate('/settings');
      return;
    }

    const keyword = document.getElementById('gmKeyword')?.value?.trim();
    const location = document.getElementById('gmLocation')?.value?.trim();

    if (!keyword) {
      Utils.showToast('Please enter a keyword', 'error');
      return;
    }

    if (!location) {
      Utils.showToast('Please enter a location', 'error');
      return;
    }

    const filters = {
      hasPhone: document.getElementById('gmFilterPhone')?.dataset.checked === 'true',
      hasWebsite: document.getElementById('gmFilterWebsite')?.dataset.checked === 'true',
      hasReviews: document.getElementById('gmFilterReviews')?.dataset.checked === 'true',
      minRating: parseFloat(document.getElementById('gmMinRating')?.value) || 0
    };

    const params = {
      keyword,
      location,
      radius: parseInt(document.getElementById('gmRadius')?.value) || 5000,
      category: document.getElementById('gmCategory')?.value,
      maxResults: parseInt(document.getElementById('gmMaxResults')?.value) || 20,
      filters
    };

    try {
      ProgressModal.show('Searching Google Maps...', params.maxResults);
      
      const response = await this.extract(params);
      
      ProgressModal.hide();
      
      if (response.results) {
        this.currentResults = response.results;
        Utils.showToast(`Found ${response.results.length} results`, 'success');
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

window.GoogleMaps = GoogleMaps;