const GoogleMaps = {
  currentResults: [],
  sessionPool: [],
  selectedIds: new Set(),
  lastRun: null,
  lastRunCost: 0,
  sessionCostTotal: 0,
  locationSearchTimer: null,
  activeLocationRequestId: 0,
  progressStream: null,
  extractionSessionId: '',
  websiteValidationTimer: null,
  savedSearches: [],
  visibleColumns: [],
  lastSearchMeta: null,
  columnPickerOpen: false,
  templateMenuOpen: false,
  autocomplete: {
    items: [],
    loading: false,
    open: false,
    activeIndex: -1,
  },
  categoryAutocomplete: {
    open: false,
    activeIndex: -1,
    query: '',
  },
  formState: {
    keyword: '',
    location: '',
    radius: 5000,
    category: 'restaurant',
    maxResults: 20,
    skipPreviouslyExtracted: true,
    filters: {
      hasPhone: false,
      hasWebsite: false,
      hasReviews: false,
      openNow: false,
      minRating: 0,
      priceLevels: [],
    },
  },
  postFilters: {
    search: '',
  },
  sortState: {
    key: 'name',
    direction: 'asc',
  },
  pagination: {
    page: 1,
    pageSize: 20,
  },
  expandedRows: new Set(),

  USD_TO_INR_RATE: 84,
  TEXT_SEARCH_REQUEST_USD: 0.017,
  DETAILS_REQUEST_USD: 0.017,

  categories: [
    { value: 'restaurant', label: 'Restaurant', group: 'Food & Dining' },
    { value: 'cafe', label: 'Cafe', group: 'Food & Dining' },
    { value: 'bar', label: 'Bar', group: 'Food & Dining' },
    { value: 'bakery', label: 'Bakery', group: 'Food & Dining' },
    { value: 'meal_delivery', label: 'Meal Delivery', group: 'Food & Dining' },
    { value: 'meal_takeaway', label: 'Meal Takeaway', group: 'Food & Dining' },
    { value: 'night_club', label: 'Night Club', group: 'Food & Dining' },
    { value: 'hospital', label: 'Hospital', group: 'Health & Wellness' },
    { value: 'doctor', label: 'Doctor', group: 'Health & Wellness' },
    { value: 'dentist', label: 'Dentist', group: 'Health & Wellness' },
    { value: 'pharmacy', label: 'Pharmacy', group: 'Health & Wellness' },
    { value: 'physiotherapist', label: 'Physiotherapist', group: 'Health & Wellness' },
    { value: 'gym', label: 'Gym', group: 'Health & Wellness' },
    { value: 'spa', label: 'Spa', group: 'Health & Wellness' },
    { value: 'beauty_salon', label: 'Beauty Salon', group: 'Health & Wellness' },
    { value: 'hair_care', label: 'Hair Care', group: 'Health & Wellness' },
    { value: 'veterinary_care', label: 'Veterinary Care', group: 'Health & Wellness' },
    { value: 'university', label: 'University', group: 'Education' },
    { value: 'school', label: 'School', group: 'Education' },
    { value: 'primary_school', label: 'Primary School', group: 'Education' },
    { value: 'secondary_school', label: 'Secondary School', group: 'Education' },
    { value: 'library', label: 'Library', group: 'Education' },
    { value: 'book_store', label: 'Book Store', group: 'Education' },
    { value: 'bank', label: 'Bank', group: 'Finance & Legal' },
    { value: 'atm', label: 'ATM', group: 'Finance & Legal' },
    { value: 'accounting', label: 'Accounting', group: 'Finance & Legal' },
    { value: 'insurance_agency', label: 'Insurance Agency', group: 'Finance & Legal' },
    { value: 'lawyer', label: 'Lawyer', group: 'Finance & Legal' },
    { value: 'real_estate_agency', label: 'Real Estate Agency', group: 'Finance & Legal' },
    { value: 'supermarket', label: 'Supermarket', group: 'Shopping' },
    { value: 'shopping_mall', label: 'Shopping Mall', group: 'Shopping' },
    { value: 'clothing_store', label: 'Clothing Store', group: 'Shopping' },
    { value: 'electronics_store', label: 'Electronics Store', group: 'Shopping' },
    { value: 'furniture_store', label: 'Furniture Store', group: 'Shopping' },
    { value: 'hardware_store', label: 'Hardware Store', group: 'Shopping' },
    { value: 'jewelry_store', label: 'Jewelry Store', group: 'Shopping' },
    { value: 'shoe_store', label: 'Shoe Store', group: 'Shopping' },
    { value: 'pet_store', label: 'Pet Store', group: 'Shopping' },
    { value: 'florist', label: 'Florist', group: 'Shopping' },
    { value: 'department_store', label: 'Department Store', group: 'Shopping' },
    { value: 'bicycle_store', label: 'Bicycle Store', group: 'Shopping' },
    { value: 'home_goods_store', label: 'Home Goods Store', group: 'Shopping' },
    { value: 'convenience_store', label: 'Convenience Store', group: 'Shopping' },
    { value: 'car_dealer', label: 'Car Dealer', group: 'Automotive' },
    { value: 'car_repair', label: 'Car Repair', group: 'Automotive' },
    { value: 'car_wash', label: 'Car Wash', group: 'Automotive' },
    { value: 'car_rental', label: 'Car Rental', group: 'Automotive' },
    { value: 'gas_station', label: 'Gas Station', group: 'Automotive' },
    { value: 'parking', label: 'Parking', group: 'Automotive' },
    { value: 'lodging', label: 'Lodging', group: 'Travel & Hospitality' },
    { value: 'travel_agency', label: 'Travel Agency', group: 'Travel & Hospitality' },
    { value: 'tourist_attraction', label: 'Tourist Attraction', group: 'Travel & Hospitality' },
    { value: 'museum', label: 'Museum', group: 'Travel & Hospitality' },
    { value: 'art_gallery', label: 'Art Gallery', group: 'Travel & Hospitality' },
    { value: 'stadium', label: 'Stadium', group: 'Travel & Hospitality' },
    { value: 'amusement_park', label: 'Amusement Park', group: 'Travel & Hospitality' },
    { value: 'zoo', label: 'Zoo', group: 'Travel & Hospitality' },
    { value: 'aquarium', label: 'Aquarium', group: 'Travel & Hospitality' },
    { value: 'bus_station', label: 'Bus Station', group: 'Transport' },
    { value: 'train_station', label: 'Train Station', group: 'Transport' },
    { value: 'subway_station', label: 'Subway Station', group: 'Transport' },
    { value: 'taxi_stand', label: 'Taxi Stand', group: 'Transport' },
    { value: 'airport', label: 'Airport', group: 'Transport' },
    { value: 'transit_station', label: 'Transit Station', group: 'Transport' },
    { value: 'electrician', label: 'Electrician', group: 'Services' },
    { value: 'plumber', label: 'Plumber', group: 'Services' },
    { value: 'painter', label: 'Painter', group: 'Services' },
    { value: 'locksmith', label: 'Locksmith', group: 'Services' },
    { value: 'laundry', label: 'Laundry', group: 'Services' },
    { value: 'moving_company', label: 'Moving Company', group: 'Services' },
    { value: 'storage', label: 'Storage', group: 'Services' },
    { value: 'roofing_contractor', label: 'Roofing Contractor', group: 'Services' },
    { value: 'city_hall', label: 'City Hall', group: 'Government & Religious' },
    { value: 'courthouse', label: 'Courthouse', group: 'Government & Religious' },
    { value: 'embassy', label: 'Embassy', group: 'Government & Religious' },
    { value: 'fire_station', label: 'Fire Station', group: 'Government & Religious' },
    { value: 'police', label: 'Police', group: 'Government & Religious' },
    { value: 'post_office', label: 'Post Office', group: 'Government & Religious' },
    { value: 'church', label: 'Church', group: 'Government & Religious' },
    { value: 'mosque', label: 'Mosque', group: 'Government & Religious' },
    { value: 'hindu_temple', label: 'Hindu Temple', group: 'Government & Religious' },
    { value: 'synagogue', label: 'Synagogue', group: 'Government & Religious' },
    { value: 'local_government_office', label: 'Local Government Office', group: 'Government & Religious' },
    { value: 'kw:Digital Marketing Agency', label: 'Digital Marketing Agency', group: 'Business & Professional' },
    { value: 'kw:Software Company', label: 'Software Company', group: 'Business & Professional' },
    { value: 'kw:Startup', label: 'Startup', group: 'Business & Professional' },
    { value: 'kw:Founder / Entrepreneur', label: 'Founder / Entrepreneur', group: 'Business & Professional' },
    { value: 'kw:Recruitment Agency', label: 'Recruitment Agency', group: 'Business & Professional' },
    { value: 'kw:Advertising Agency', label: 'Advertising Agency', group: 'Business & Professional' },
    { value: 'kw:Consulting Firm', label: 'Consulting Firm', group: 'Business & Professional' },
    { value: 'kw:Event Management Company', label: 'Event Management Company', group: 'Business & Professional' },
    { value: 'kw:PR Agency', label: 'PR Agency', group: 'Business & Professional' },
    { value: 'kw:Logistics Company', label: 'Logistics Company', group: 'Business & Professional' },
    { value: 'kw:Manufacturing Company', label: 'Manufacturing Company', group: 'Business & Professional' },
    { value: 'kw:Construction Company', label: 'Construction Company', group: 'Business & Professional' },
    { value: 'kw:Warehouse', label: 'Warehouse', group: 'Business & Professional' },
    { value: 'kw:Import Export Business', label: 'Import Export Business', group: 'Business & Professional' },
    { value: 'kw:Chartered Accountant', label: 'Chartered Accountant', group: 'Business & Professional' },
    { value: 'kw:Architecture Firm', label: 'Architecture Firm', group: 'Business & Professional' },
  ],

  priceLevels: [
    ['PRICE_LEVEL_INEXPENSIVE', '$'],
    ['PRICE_LEVEL_MODERATE', '$$'],
    ['PRICE_LEVEL_EXPENSIVE', '$$$'],
    ['PRICE_LEVEL_VERY_EXPENSIVE', '$$$$'],
  ],

  columnDefinitions: [
    ['name', 'Name'],
    ['address', 'Address'],
    ['phone', 'Phone'],
    ['website', 'Website'],
    ['rating', 'Rating'],
    ['reviews', 'Reviews'],
    ['category', 'Category'],
    ['hours', 'Hours'],
    ['status', 'Status'],
    ['coordinates', 'Coordinates'],
  ],

  searchTemplates: [
    { name: 'Restaurants in City', keyword: 'restaurant', radius: 5000, category: 'restaurant' },
    { name: 'Hospitals & Clinics', keyword: 'hospital', radius: 5000, category: 'hospital' },
    { name: 'Digital Marketing Agencies', keyword: 'Digital Marketing Agency', radius: 5000, category: 'kw:Digital Marketing Agency' },
    { name: 'IT Companies', keyword: 'Software Company', radius: 5000, category: 'kw:Software Company' },
    { name: 'Real Estate Agents', keyword: 'real estate', radius: 5000, category: 'real_estate_agency' },
    { name: 'Hotels & Lodging', keyword: 'hotel', radius: 5000, category: 'lodging' },
    { name: 'Chartered Accountants', keyword: 'Chartered Accountant', radius: 5000, category: 'kw:Chartered Accountant' },
    { name: 'Gyms & Fitness', keyword: 'gym', radius: 5000, category: 'gym' },
  ],

  getDefaultFormState() {
    return {
      keyword: '',
      location: '',
      radius: 5000,
      category: 'restaurant',
      maxResults: 20,
      skipPreviouslyExtracted: true,
      filters: {
        hasPhone: false,
        hasWebsite: false,
        hasReviews: false,
        openNow: false,
        minRating: 0,
        priceLevels: [],
      },
    };
  },

  ensureClientState() {
    if (!this.savedSearches.length) {
      this.savedSearches = Utils.getSavedSearches();
    }

    if (!this.visibleColumns.length) {
      this.visibleColumns = Utils.getMapsColumnPrefs(this.columnDefinitions.map(([key]) => key));
    }
  },

  getVisibleColumns() {
    this.ensureClientState();
    return this.visibleColumns.length ? this.visibleColumns : this.columnDefinitions.map(([key]) => key);
  },

  getResultCoordinates(row) {
    if (!row) return '';
    if (row.latitude == null || row.longitude == null || row.latitude === '' || row.longitude === '') return '';
    return `${row.latitude}, ${row.longitude}`;
  },

  getSessionKey(row) {
    const normalizedPhone = String(row.rawPhone || row.phone || '').replace(/\D/g, '');
    return `${row.placeId || row.id || row.name}::${normalizedPhone}`;
  },

  dedupeRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = this.getSessionKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  getFilteredResults() {
    const search = this.postFilters.search.trim().toLowerCase();
    const filtered = this.currentResults.filter((row) => {
      if (!search) return true;

      const haystack = [
        row.name,
        row.address,
        row.phone,
        row.website,
        row.category,
        row.hours,
        row.status,
        this.getResultCoordinates(row),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });

    const { key, direction } = this.sortState;
    filtered.sort((left, right) => {
      const leftValue = key === 'coordinates' ? this.getResultCoordinates(left) : left[key] ?? '';
      const rightValue = key === 'coordinates' ? this.getResultCoordinates(right) : right[key] ?? '';
      const numeric = ['index', 'rating', 'reviews'].includes(key);

      if (numeric) {
        return direction === 'asc'
          ? Number(leftValue || 0) - Number(rightValue || 0)
          : Number(rightValue || 0) - Number(leftValue || 0);
      }

      return direction === 'asc'
        ? String(leftValue).localeCompare(String(rightValue))
        : String(rightValue).localeCompare(String(leftValue));
    });

    return filtered;
  },

  getMetrics(results) {
    const ratingValues = results.map((row) => Number(row.rating)).filter((value) => Number.isFinite(value) && value > 0);
    const withPhone = results.filter((row) => row.phone).length;
    const withWebsite = results.filter((row) => row.website).length;

    return {
      averageRating: ratingValues.length ? (ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length).toFixed(1) : '-',
      withPhone,
      withWebsite,
    };
  },

  resetSelection() {
    this.selectedIds = new Set();
  },

  setHistoryPreview(entry) {
    this.currentResults = (entry.results || []).map((row, index) => ({ ...row, index: index + 1, websiteStatus: row.websiteStatus || 'unchecked' }));
    this.lastRun = entry;
    this.lastSearchMeta = entry.summary || null;
    this.lastRunCost = Number(entry.cost?.inr || this.calculateCost(this.currentResults.length).total);
    this.resetSelection();
    this.expandedRows = new Set();
    this.pagination.page = 1;
    this.postFilters = { search: '' };
  },

  loadSearchFromHistory(entry) {
    const params = entry?.params || {};
    this.formState = {
      ...this.getDefaultFormState(),
      keyword: params.keyword || params.query || '',
      location: params.location || '',
      radius: Number(params.radius) || 5000,
      category: params.category || 'restaurant',
      maxResults: Number(params.maxResults) || 20,
      filters: {
        ...this.getDefaultFormState().filters,
        ...(params.filters || {}),
      },
    };
    this.currentResults = [];
    this.lastRun = null;
    this.lastSearchMeta = null;
    this.resetSelection();
    this.pagination.page = 1;
    this.postFilters = { search: '' };
    this.renderInto(document.getElementById('content'));
  },

  formatPriceLevel(level) {
    const match = this.priceLevels.find(([value]) => value === level);
    return match ? match[1] : '-';
  },

  formatStatus(status) {
    return String(status || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';
  },

  renderStars(rating) {
    const normalized = Number(rating || 0);
    if (!normalized) return '-';
    const filled = Math.max(0, Math.min(5, Math.round(normalized)));
    return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
  },

  getSelectionCount(results = this.getFilteredResults()) {
    return results.filter((row) => this.selectedIds.has(row.id)).length;
  },

  ensurePagination(results = this.getFilteredResults()) {
    const totalPages = Math.max(1, Math.ceil(results.length / this.pagination.pageSize));
    this.pagination.page = Math.min(Math.max(this.pagination.page, 1), totalPages);
    return totalPages;
  },

  getVisibleResults(results = this.getFilteredResults()) {
    this.ensurePagination(results);
    const start = (this.pagination.page - 1) * this.pagination.pageSize;
    return results.slice(start, start + this.pagination.pageSize);
  },

  setPage(page, results = this.getFilteredResults()) {
    const totalPages = this.ensurePagination(results);
    this.pagination.page = Math.min(Math.max(page, 1), totalPages);
  },

  toggleExpandedRow(rowId) {
    if (this.expandedRows.has(rowId)) {
      this.expandedRows.delete(rowId);
    } else {
      this.expandedRows.add(rowId);
    }
  },

  getSelectedCategory() {
    return this.categories.find((item) => item.value === this.formState.category) || this.categories[0];
  },

  getCategoryFilterValue() {
    return this.categoryAutocomplete.open ? (this.categoryAutocomplete.query ?? '') : this.getSelectedCategory()?.label || '';
  },

  getFilteredCategories(query = this.categoryAutocomplete.query || '') {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return this.categories;

    return this.categories.filter((item) => [item.label, item.group, item.value].some((value) => String(value || '').toLowerCase().includes(normalized)));
  },

  groupCategories(items) {
    return items.reduce((groups, item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
      return groups;
    }, {});
  },

  formatCurrency(amount) {
    return Utils.formatCurrencyInr(amount);
  },

  calculateCost(detailsCount = this.formState.maxResults) {
    const normalizedDetails = Math.max(0, Number(detailsCount) || 0);
    const textSearchInr = this.TEXT_SEARCH_REQUEST_USD * this.USD_TO_INR_RATE;
    const detailLookupInr = this.DETAILS_REQUEST_USD * this.USD_TO_INR_RATE;
    const total = textSearchInr + normalizedDetails * detailLookupInr;
    return {
      textSearches: 1,
      detailLookups: normalizedDetails,
      textSearchInr,
      detailLookupInr,
      total,
      formula: `1 text search (${this.formatCurrency(textSearchInr)}) + ${normalizedDetails} detail lookup${normalizedDetails === 1 ? '' : 's'} (${normalizedDetails} × ${this.formatCurrency(detailLookupInr)}) = ${this.formatCurrency(total)}`,
    };
  },

  getSeenCacheKey() {
    return Utils.buildMapsSeenCacheKey(this.formState.keyword, this.formState.location);
  },

  async getSeenPlaceIds(cacheKey) {
    const localIds = Utils.getMapsSeenPlaceIds(cacheKey);
    try {
      const response = await Api.getMapsSeenSession(cacheKey);
      return Array.from(new Set([...(response.placeIds || []), ...localIds]));
    } catch (error) {
      return localIds;
    }
  },

  async persistSeenPlaceIds(cacheKey, rows = []) {
    const placeIds = rows.map((row) => row.placeId || row.id).filter(Boolean);
    Utils.saveMapsSeenPlaceIds(cacheKey, placeIds);
    try {
      await Api.saveMapsSeenSession(cacheKey, placeIds);
    } catch (error) {
      // The local cache remains authoritative for the browser session.
    }
  },

  clearSeenPlaceCache() {
    this.syncFormState();
    const cacheKey = this.getSeenCacheKey();
    if (cacheKey && cacheKey !== '::') {
      Utils.clearMapsSeenPlaceIds(cacheKey);
      Utils.showToast('Session cache cleared', `Removed cached place IDs for ${this.formState.keyword} in ${this.formState.location}.`, 'success');
      this.renderInto(document.getElementById('content'));
      return;
    }

    Utils.clearMapsSeenPlaceIds();
    Utils.showToast('Session cache cleared', 'Removed all cached Google Maps place IDs.', 'success');
    this.renderInto(document.getElementById('content'));
  },

  renderCostMarkup(cost, prefixLabel) {
    return `
      <div class="cost-estimate-card">
        <span class="pill">${Utils.escapeHtml(prefixLabel)}</span>
        <strong>${Utils.escapeHtml(this.formatCurrency(cost.total))}</strong>
        <span>${Utils.escapeHtml(cost.formula)}</span>
      </div>
    `;
  },

  renderLocationSuggestionsShell() {
    return '<div id="location-autocomplete-dropdown" class="autocomplete-menu hidden" role="listbox" aria-label="Location suggestions"></div>';
  },

  renderCategoryDropdownShell() {
    return '<div id="gmCategorySuggestions" class="autocomplete-menu category-menu hidden" role="listbox" aria-label="Category suggestions"></div>';
  },

  renderTemplateMenu() {
    if (!this.templateMenuOpen) return '';

    return `
      <div class="floating-popover template-popover" id="gmTemplateMenu">
        ${this.searchTemplates
          .map(
            (template, index) => `
              <button class="popover-option" type="button" data-template-index="${index}">
                <strong>${Utils.escapeHtml(template.name)}</strong>
                <span>${Utils.escapeHtml(template.keyword)} • ${Utils.formatNumber(template.radius / 1000)}km</span>
              </button>
            `,
          )
          .join('')}
      </div>
    `;
  },

  renderSavedSearches() {
    if (!this.savedSearches.length) {
      return '<div class="saved-search-empty muted">No saved searches yet. Save frequently used parameter sets here.</div>';
    }

    return `
      <div class="saved-search-list">
        ${this.savedSearches
          .map(
            (search, index) => `
              <button class="saved-search-chip" type="button" data-saved-search="${index}">
                <span>${Utils.escapeHtml(search.name)}</span>
                <small>${Utils.escapeHtml(Utils.relativeTime(search.savedAt))}</small>
                <span class="saved-search-remove" data-delete-saved-search="${index}" aria-label="Delete saved search">${Utils.icon('delete')}</span>
              </button>
            `,
          )
          .join('')}
      </div>
    `;
  },

  renderCategoryOptions(query = this.categoryAutocomplete.query || '') {
    const filtered = this.getFilteredCategories(query);
    const groups = this.groupCategories(filtered);
    const entries = Object.entries(groups);

    if (!entries.length) {
      return '<button class="autocomplete-option" type="button" disabled>No matching categories</button>';
    }

    let optionIndex = -1;
    return entries
      .map(([group, items]) => {
        const options = items
          .map((item) => {
            optionIndex += 1;
            return `
              <button class="autocomplete-option ${this.categoryAutocomplete.activeIndex === optionIndex ? 'active' : ''}" type="button" data-category-option="${optionIndex}">
                <strong>${Utils.escapeHtml(item.label)}</strong>
                <span>${Utils.escapeHtml(group)}</span>
              </button>
            `;
          })
          .join('');

        return `<div class="autocomplete-group"><div class="autocomplete-group-label">${Utils.escapeHtml(group)}</div>${options}</div>`;
      })
      .join('');
  },

  renderLocationSuggestionsMarkup() {
    if (this.autocomplete.loading) {
      return '<button class="autocomplete-option" type="button" disabled>Searching locations…</button>';
    }

    if (!this.autocomplete.items.length) {
      return '<button class="autocomplete-option" type="button" disabled>No matching cities found</button>';
    }

    return this.autocomplete.items
      .map(
        (item, index) => `
          <button class="autocomplete-option ${this.autocomplete.activeIndex === index ? 'active' : ''}" type="button" data-location-option="${index}">
            <strong>${Utils.escapeHtml(item.mainText || item.label)}</strong>
            <span>${Utils.escapeHtml(item.secondaryText || item.label)}</span>
          </button>
        `,
      )
      .join('');
  },

  renderColumnPicker() {
    if (!this.columnPickerOpen) return '';

    const visible = new Set(this.getVisibleColumns());
    return `
      <div class="floating-popover column-popover" id="gmColumnPicker">
        ${this.columnDefinitions
          .map(
            ([key, label]) => `
              <label class="checkbox-row compact">
                <input type="checkbox" data-column-key="${key}" ${visible.has(key) ? 'checked' : ''}>
                ${Utils.escapeHtml(label)}
              </label>
            `,
          )
          .join('')}
      </div>
    `;
  },

  renderWebsiteIndicator(status) {
    const normalized = status || 'unchecked';
    const title = {
      unchecked: 'Unchecked',
      checking: 'Checking',
      reachable: 'Reachable',
      unreachable: 'Unreachable',
      dead: 'Dead',
    }[normalized] || normalized;

    return `<span class="website-status-dot ${normalized}" title="${Utils.escapeHtml(title)}"></span>`;
  },

  updateLocationSuggestions() {
    const menu = document.getElementById('location-autocomplete-dropdown');
    const input = document.getElementById('gmLocation');
    if (!menu || !input) return;

    const shouldOpen = this.autocomplete.open && (this.autocomplete.loading || this.autocomplete.items.length || input.value.trim().length >= 2);
    menu.innerHTML = shouldOpen ? this.renderLocationSuggestionsMarkup() : '';
    menu.classList.toggle('hidden', !shouldOpen);
    input.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

    menu.querySelectorAll('[data-location-option]').forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.selectLocationSuggestion(Number(button.dataset.locationOption));
      });
    });
  },

  updateCategorySuggestions() {
    const menu = document.getElementById('gmCategorySuggestions');
    const input = document.getElementById('gmCategorySearch');
    if (!menu || !input) return;

    menu.innerHTML = this.categoryAutocomplete.open ? this.renderCategoryOptions() : '';
    menu.classList.toggle('hidden', !this.categoryAutocomplete.open);
    input.setAttribute('aria-expanded', this.categoryAutocomplete.open ? 'true' : 'false');

    menu.querySelectorAll('[data-category-option]').forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.selectCategoryByIndex(Number(button.dataset.categoryOption));
      });
    });
  },

  updateCostDisplays() {
    const estimated = this.calculateCost(this.formState.maxResults);
    const actual = this.calculateCost(this.currentResults.length);
    const actualText = this.lastRun ? actual.formula : `${this.formatCurrency(0)} (awaiting first run)`;

    document.querySelectorAll('[data-cost-estimate]').forEach((node) => {
      node.textContent = estimated.formula;
    });

    document.querySelectorAll('[data-cost-actual]').forEach((node) => {
      node.textContent = actualText;
    });

    document.querySelectorAll('[data-cost-session]').forEach((node) => {
      node.textContent = this.formatCurrency(this.sessionCostTotal);
    });
  },

  saveSearch() {
    this.syncFormState();
    if (!this.formState.keyword || !this.formState.location) {
      Utils.showToast('Search incomplete', 'Keyword and location are required before saving a search.', 'warning');
      return;
    }

    const name = window.prompt('Save search as:', `${this.formState.keyword} in ${this.formState.location}`);
    if (!name) return;

    const next = [
      {
        name: name.trim(),
        params: structuredClone(this.formState),
        savedAt: new Date().toISOString(),
      },
      ...this.savedSearches.filter((item) => item.name !== name.trim()),
    ].slice(0, 10);

    this.savedSearches = Utils.saveSavedSearches(next);
    Utils.showToast('Search saved', `${name.trim()} is now available above the form.`, 'success');
    this.renderInto(document.getElementById('content'));
  },

  loadSavedSearch(index) {
    const saved = this.savedSearches[index];
    if (!saved) return;
    this.formState = {
      ...this.getDefaultFormState(),
      ...structuredClone(saved.params),
      filters: {
        ...this.getDefaultFormState().filters,
        ...(saved.params?.filters || {}),
      },
    };
    this.renderInto(document.getElementById('content'));
  },

  deleteSavedSearch(index) {
    this.savedSearches.splice(index, 1);
    this.savedSearches = Utils.saveSavedSearches(this.savedSearches);
    this.renderInto(document.getElementById('content'));
  },

  applyTemplate(index) {
    const template = this.searchTemplates[index];
    if (!template) return;

    this.formState = {
      ...this.formState,
      keyword: template.keyword,
      radius: template.radius || this.formState.radius,
      category: template.category || this.formState.category,
    };
    this.templateMenuOpen = false;
    this.renderInto(document.getElementById('content'));
  },

  toggleColumn(key, checked) {
    const current = new Set(this.getVisibleColumns());
    if (checked) {
      current.add(key);
    } else if (current.size > 1) {
      current.delete(key);
    }

    this.visibleColumns = Utils.saveMapsColumnPrefs(this.columnDefinitions.map(([columnKey]) => columnKey).filter((columnKey) => current.has(columnKey)));
    this.renderInto(document.getElementById('content'));
  },

  addCurrentToSession() {
    if (!this.currentResults.length) {
      Utils.showToast('No results to add', 'Run a Google Maps extraction first.', 'warning');
      return;
    }

    const before = this.sessionPool.length;
    this.sessionPool = this.dedupeRows([...this.sessionPool, ...this.currentResults]);
    const added = this.sessionPool.length - before;
    Utils.showToast('Session pool updated', `${added} new rows added. Session total is ${this.sessionPool.length}.`, 'success');
    this.renderInto(document.getElementById('content'));
  },

  clearCurrentResults() {
    this.currentResults = [];
    this.lastRun = null;
    this.lastSearchMeta = null;
    this.lastRunCost = 0;
    this.resetSelection();
    this.expandedRows = new Set();
    this.pagination.page = 1;
    this.postFilters = { search: '' };
    this.renderInto(document.getElementById('content'));
  },

  buildExportRows(rows = [], columnKeys = this.getVisibleColumns()) {
    const labels = Object.fromEntries(this.columnDefinitions);
    return rows.map((row) => {
      const exportRow = {};
      columnKeys.forEach((key) => {
        const label = labels[key];
        if (!label) return;

        if (key === 'status') {
          exportRow[label] = this.formatStatus(row.status);
          return;
        }
        if (key === 'coordinates') {
          exportRow[label] = this.getResultCoordinates(row);
          return;
        }
        exportRow[label] = row[key] ?? '';
      });
      return exportRow;
    });
  },

  getExportFilename(format = 'xlsx') {
    const keyword = Utils.slugify(this.formState.keyword || 'results');
    const location = Utils.slugify(this.formState.location || 'location');
    return `google_maps_${keyword}_${location}_${Utils.timestamp()}.${format}`;
  },

  getExportData(selectedOnly, format = 'xlsx') {
    const rows = selectedOnly ? Utils.pickExportRows(this.getFilteredResults(), this.selectedIds) : this.getFilteredResults();
    const data = this.buildExportRows(rows, this.getVisibleColumns());

    return {
      data,
      source: 'google_maps',
      mode: selectedOnly ? 'selected' : 'all',
      sheetName: 'Google Maps Results',
      filename: this.getExportFilename(format),
      format,
    };
  },

  syncFormState() {
    this.formState.keyword = document.getElementById('gmKeyword').value.trim();
    this.formState.location = document.getElementById('gmLocation').value.trim();
    this.formState.category = document.getElementById('gmCategory').value;
    this.formState.maxResults = Number(document.getElementById('gmMaxResults').value) || 20;
    this.formState.radius = Utils.clamp(Utils.parseNumber(document.getElementById('gmRadius').value, 5000), 100, 50000);
    this.formState.skipPreviouslyExtracted = document.getElementById('gmSkipSeen')?.checked ?? true;
    this.formState.filters = {
      hasPhone: document.getElementById('gmHasPhone').checked,
      hasWebsite: document.getElementById('gmHasWebsite').checked,
      hasReviews: document.getElementById('gmHasReviews').checked,
      openNow: document.getElementById('gmOpenNow').checked,
      minRating: Utils.parseNumber(document.getElementById('gmMinRating').value, 0),
      priceLevels: Array.from(document.querySelectorAll('[data-price-level]:checked')).map((input) => input.dataset.priceLevel),
    };
  },

  closeLocationSuggestions() {
    this.autocomplete = { items: [], loading: false, open: false, activeIndex: -1 };
    this.updateLocationSuggestions();
  },

  openCategoryDropdown(query = '') {
    this.categoryAutocomplete = {
      ...this.categoryAutocomplete,
      open: true,
      activeIndex: -1,
      query,
    };
    this.updateCategorySuggestions();
  },

  closeCategoryDropdown(resetToSelected = false) {
    if (resetToSelected) {
      const selected = this.getSelectedCategory();
      const input = document.getElementById('gmCategorySearch');
      if (input && selected) input.value = selected.label;
    }

    this.categoryAutocomplete = { ...this.categoryAutocomplete, open: false, activeIndex: -1, query: '' };
    this.updateCategorySuggestions();
  },

  selectCategoryByIndex(index) {
    const filtered = this.getFilteredCategories();
    const selected = filtered[index];
    if (!selected) return;

    this.formState.category = selected.value;
    const hiddenInput = document.getElementById('gmCategory');
    const searchInput = document.getElementById('gmCategorySearch');
    if (hiddenInput) hiddenInput.value = selected.value;
    if (searchInput) searchInput.value = selected.label;
    this.closeCategoryDropdown();
  },

  async fetchLocationSuggestions(query) {
    const settings = Utils.getSettings();
    const normalizedQuery = query.trim();
    const requestId = ++this.activeLocationRequestId;

    if (!settings.googleMapsApiKey || normalizedQuery.length < 2) {
      this.closeLocationSuggestions();
      return;
    }

    this.autocomplete = { ...this.autocomplete, loading: true, open: true, activeIndex: -1 };
    this.updateLocationSuggestions();

    try {
      const response = await Api.getGoogleLocationSuggestions(normalizedQuery, settings.googleMapsApiKey);
      if (requestId !== this.activeLocationRequestId) return;
      this.autocomplete = {
        items: response.suggestions || [],
        loading: false,
        open: true,
        activeIndex: -1,
      };
    } catch (error) {
      if (requestId !== this.activeLocationRequestId) return;
      this.autocomplete = { items: [], loading: false, open: true, activeIndex: -1 };
    }

    this.updateLocationSuggestions();
  },

  selectLocationSuggestion(index) {
    const selected = this.autocomplete.items[index];
    if (!selected) return;
    this.formState.location = selected.label;
    const locationInput = document.getElementById('gmLocation');
    if (locationInput) locationInput.value = selected.label;
    this.closeLocationSuggestions();
    locationInput?.focus();
  },

  connectProgressStream(sessionId) {
    this.disconnectProgressStream();
    this.extractionSessionId = sessionId;
    this.progressStream = Api.createMapsProgressStream(sessionId);

    this.progressStream.addEventListener('progress', (event) => {
      const payload = JSON.parse(event.data);
      App.Progress.update(
        payload.message || `Fetching record ${payload.fetched} of ${payload.total}`,
        {
          current: payload.fetched,
          total: payload.total,
          eta: payload.eta,
          currentPlace: payload.currentPlace,
        },
      );
    });

    this.progressStream.addEventListener('done', (event) => {
      const payload = JSON.parse(event.data);
      App.Progress.update(
        payload.message || `Fetched ${payload.fetched} of ${payload.total} results...`,
        {
          current: payload.fetched,
          total: payload.total,
          eta: 0,
          currentPlace: payload.currentPlace,
        },
      );
      this.disconnectProgressStream();
    });

    this.progressStream.onerror = () => {
      this.disconnectProgressStream();
    };
  },

  disconnectProgressStream() {
    if (this.progressStream) {
      this.progressStream.close();
      this.progressStream = null;
    }
  },

  scheduleWebsiteStatusRefresh() {
    window.clearTimeout(this.websiteValidationTimer);
    this.websiteValidationTimer = window.setTimeout(() => {
      this.renderInto(document.getElementById('content'));
    }, 120);
  },

  updateWebsiteStatus(rowId, status) {
    const applyStatus = (rows) => {
      const row = rows.find((item) => item.id === rowId);
      if (row) row.websiteStatus = status;
    };

    applyStatus(this.currentResults);
    applyStatus(this.sessionPool);
    this.scheduleWebsiteStatusRefresh();
  },

  async runWebsiteChecks() {
    const pending = this.currentResults.filter((row) => row.website && (!row.websiteStatus || row.websiteStatus === 'unchecked'));
    if (!pending.length) return;

    const queue = [...pending];
    const workers = new Array(Math.min(4, queue.length)).fill(null).map(async () => {
      while (queue.length) {
        const row = queue.shift();
        if (!row) return;
        this.updateWebsiteStatus(row.id, 'checking');
        try {
          const result = await Api.checkUrl(row.website);
          this.updateWebsiteStatus(row.id, result.reachable ? 'reachable' : 'dead');
        } catch (error) {
          this.updateWebsiteStatus(row.id, 'unreachable');
        }
      }
    });

    await Promise.all(workers);
  },

  renderPage() {
    this.ensureClientState();
    const settings = Utils.getSettings();
    const results = this.getFilteredResults();
    const visibleResults = this.getVisibleResults(results);
    const selectedCount = this.getSelectionCount(results);
    const metrics = this.getMetrics(results);
    const selectedCategory = this.getSelectedCategory();
    const estimatedCost = this.calculateCost(this.formState.maxResults);
    const actualCost = this.calculateCost(this.currentResults.length);
    const actualCostText = this.lastRun ? actualCost.formula : `${this.formatCurrency(0)} (awaiting first run)`;
    const seenCacheCount = Utils.getMapsSeenPlaceIds(this.getSeenCacheKey()).length;
    const strategyLabel = this.lastSearchMeta?.strategyLabel || 'Single search is used up to 60 results. Larger requests switch to grid search automatically.';
    const dedupeLabel = this.lastSearchMeta
      ? `Skipped ${this.lastSearchMeta.excludedSkipped || 0} already-extracted places and ${this.lastSearchMeta.duplicatesSkipped || 0} overlapping duplicates.`
      : 'Enable skip-seen to avoid re-fetching places already captured for the same keyword and location.';
    const priceOptions = this.priceLevels
      .map(
        ([value, label]) => `
          <label class="checkbox-row compact">
            <input type="checkbox" data-price-level="${value}" ${this.formState.filters.priceLevels.includes(value) ? 'checked' : ''}>
            ${label}
          </label>
        `,
      )
      .join('');

    return `
      <section class="hero-panel">
        <div class="hero-grid">
          <div class="hero-copy">
            <div>
              <p class="eyebrow">Google Places API (New)</p>
              <h2 class="headline">Run bulk Google Maps extraction, save reusable searches, and manage a deduplicated session pool.</h2>
            </div>
            <p class="lead">The client now streams extraction progress from the server, stores saved searches locally, validates websites after extraction, and lets you export only the visible columns.</p>
            <div class="chip-list">
              <span class="chip">API key sourced from Settings</span>
              <span class="chip">Bulk extraction up to 500 results</span>
              <span class="chip">Session pool: ${this.sessionPool.length}</span>
            </div>
          </div>
          <div class="kpi-band">
            <article class="stat-card">
              <p class="eyebrow">Current set</p>
              <div class="stat-value">${results.length}</div>
              <p class="muted">Rows visible after post-filters</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Selected</p>
              <div class="stat-value">${selectedCount}</div>
              <p class="muted">Ready for export</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Session pool</p>
              <div class="stat-value">${this.sessionPool.length}</div>
              <p class="muted">Deduplicated by place + phone</p>
            </article>
            <article class="stat-card">
              <p class="eyebrow">Last run</p>
              <div class="stat-value">${this.lastRun ? Utils.relativeTime(this.lastRun.timestamp) : 'None'}</div>
              <p class="muted">${this.lastRun ? `${this.lastRun.count} rows captured` : 'Run a search to begin'}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="extractor-layout">
        <article class="glass-card">
          <div class="section-head">
            <div>
              <h3>Search form</h3>
              <p>Keyword, location, category, bulk max-results, saved searches, and server-side filters.</p>
            </div>
            <div class="inline-actions">
              <div class="popover-anchor">
                <button class="button secondary" id="gmTemplatesToggle" type="button">Templates</button>
                ${this.renderTemplateMenu()}
              </div>
            </div>
          </div>

          <div class="saved-searches-block">
            <div class="saved-searches-head">
              <strong>Saved searches</strong>
              <span class="muted">Max 10</span>
            </div>
            ${this.renderSavedSearches()}
          </div>

          <div class="form-stack">
            <div class="field-grid">
              <div class="field">
                <label for="gmKeyword">Keyword</label>
                <input id="gmKeyword" type="text" value="${Utils.escapeHtml(this.formState.keyword)}" placeholder="restaurants, dentists, coworking">
              </div>
              <div class="field autocomplete-field">
                <label for="gmLocation">Location</label>
                <input id="gmLocation" type="text" value="${Utils.escapeHtml(this.formState.location)}" placeholder="e.g. Mumbai, Delhi, Bengaluru" autocomplete="off" aria-autocomplete="list" aria-controls="location-autocomplete-dropdown" aria-expanded="false">
                ${this.renderLocationSuggestionsShell()}
              </div>
              <div class="field autocomplete-field">
                <label for="gmCategorySearch">Category</label>
                <input id="gmCategorySearch" type="text" value="${Utils.escapeHtml(this.getCategoryFilterValue())}" placeholder="Search categories" autocomplete="off" aria-autocomplete="list" aria-controls="gmCategorySuggestions" aria-expanded="false">
                <input id="gmCategory" type="hidden" value="${Utils.escapeHtml(selectedCategory.value)}">
                ${this.renderCategoryDropdownShell()}
              </div>
              <div class="field">
                <label for="gmMaxResults">Max Results</label>
                <select id="gmMaxResults">
                  ${[20, 40, 60, 100, 200, 500]
                    .map((value) => `<option value="${value}" ${Number(this.formState.maxResults) === value ? 'selected' : ''}>${value}</option>`)
                    .join('')}
                </select>
              </div>
            </div>

            <div class="filter-grid">
              <label class="checkbox-row"><input id="gmSkipSeen" type="checkbox" ${this.formState.skipPreviouslyExtracted ? 'checked' : ''}>Skip previously extracted</label>
              <div class="summary-chip">
                <span class="pill">Seen cache</span>
                <span class="muted">${seenCacheCount} place IDs for this search key</span>
              </div>
            </div>

            <div class="slider-field">
              <label for="gmRadius">Radius</label>
              <input id="gmRadius" type="range" min="100" max="50000" step="100" value="${this.formState.radius}">
              <output id="gmRadiusValue">${Utils.formatNumber(this.formState.radius)} meters</output>
            </div>

            <div class="filter-grid">
              <label class="checkbox-row"><input id="gmHasPhone" type="checkbox" ${this.formState.filters.hasPhone ? 'checked' : ''}>Has phone</label>
              <label class="checkbox-row"><input id="gmHasWebsite" type="checkbox" ${this.formState.filters.hasWebsite ? 'checked' : ''}>Has website</label>
              <label class="checkbox-row"><input id="gmHasReviews" type="checkbox" ${this.formState.filters.hasReviews ? 'checked' : ''}>Has reviews</label>
              <label class="checkbox-row"><input id="gmOpenNow" type="checkbox" ${this.formState.filters.openNow ? 'checked' : ''}>Open now</label>
            </div>

            <div class="field-grid">
              <div class="slider-field">
                <label for="gmMinRating">Minimum rating</label>
                <input id="gmMinRating" type="range" min="0" max="5" step="0.5" value="${this.formState.filters.minRating}">
                <output id="gmMinRatingValue">${Number(this.formState.filters.minRating).toFixed(1)}</output>
              </div>
              <div class="field">
                <label>Price level</label>
                <div class="price-level-grid">${priceOptions}</div>
              </div>
            </div>

            <div class="form-actions">
              <button class="button primary" id="gmRunSearch">Extract</button>
              <button class="button secondary" id="gmSaveSearch">Save Search</button>
              <button class="button secondary" id="gmClearSeenCache">Clear session cache</button>
              <button class="button secondary" id="gmResetForm">Reset form</button>
            </div>
            <div class="results-note">${Utils.escapeHtml(strategyLabel)}</div>
            <div class="results-note">${Utils.escapeHtml(dedupeLabel)}</div>
            <div class="cost-strip prominent">
              ${this.renderCostMarkup(estimatedCost, 'Estimated cost')}
              <div class="cost-estimate-card subtle">
                <span class="pill">Session total</span>
                <strong data-cost-session>${Utils.escapeHtml(this.formatCurrency(this.sessionCostTotal))}</strong>
                <span>Accumulated across this browser session.</span>
              </div>
              <div class="cost-estimate-card subtle">
                <span class="pill">Pricing note</span>
                <strong>USD to INR rate: 84</strong>
                <span>Text Search + Place Details workflow. Cost per history entry is shown in ₹.</span>
              </div>
            </div>
          </div>
        </article>

        <article class="glass-card">
          <div class="section-head">
            <div>
              <h3>Extraction notes</h3>
              <p>Progress is streamed via SSE while the server runs single search, grid search, and fallback query variations.</p>
            </div>
          </div>
          <div class="summary-strip">
            <div class="summary-chip">
              <span class="pill">API key</span>
              <span class="muted">${settings.googleMapsApiKey ? 'Configured in Settings' : 'Missing'}</span>
            </div>
            <div class="summary-chip">
              <span class="pill">Server mode</span>
              <span class="muted">${Utils.escapeHtml(this.lastSearchMeta?.strategyLabel || 'Text Search + Place Details + dedupe')}</span>
            </div>
            <div class="summary-chip">
              <span class="pill">Website checks</span>
              <span class="muted">Auto-run after extraction completes</span>
            </div>
            <div class="summary-chip">
              <span class="pill">Session total count</span>
              <span class="muted">${this.sessionPool.length} unique businesses</span>
            </div>
            <div class="summary-chip">
              <span class="pill">Deduping</span>
              <span class="muted">${Utils.escapeHtml(dedupeLabel)}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="table-card">
        <div class="section-head">
          <div>
            <h3>Results workspace</h3>
            <p>${results.length} rows found, ${selectedCount} selected.</p>
          </div>
          <div class="inline-actions">
            <span class="badge results-count-badge">Session total ${this.sessionPool.length}</span>
            <div class="popover-anchor">
              <button class="icon-btn" id="gmColumnsToggle" type="button" aria-label="Toggle visible columns">${Utils.icon('settings')}</button>
              ${this.renderColumnPicker()}
            </div>
          </div>
        </div>
        <div class="results-cost-meta">
          <div class="results-cost-line"><strong>Actual cost this run:</strong> <span data-cost-actual>${Utils.escapeHtml(actualCostText)}</span></div>
          <div class="results-cost-line"><strong>Session total:</strong> <span data-cost-session>${Utils.escapeHtml(this.formatCurrency(this.sessionCostTotal))}</span></div>
          <div class="results-cost-line"><strong>Estimated next run:</strong> <span data-cost-estimate>${Utils.escapeHtml(estimatedCost.formula)}</span></div>
        </div>
        ${this.renderResultsHighlights(results, metrics)}
        ${this.renderResultsControls(results)}
        ${this.renderResultsTable(results, visibleResults)}
      </section>
    `;
  },

  renderResultsHighlights(results, metrics) {
    return `
      <div class="results-highlights">
        <article class="result-metric-card">
          <span class="pill">Average rating</span>
          <strong>${metrics.averageRating}</strong>
          <span>${results.length ? 'Across visible rows' : 'Run a search first'}</span>
        </article>
        <article class="result-metric-card">
          <span class="pill">Phone coverage</span>
          <strong>${metrics.withPhone}</strong>
          <span>${results.length ? `${Math.round((metrics.withPhone / results.length) * 100)}% with phone` : 'No rows yet'}</span>
        </article>
        <article class="result-metric-card">
          <span class="pill">Website coverage</span>
          <strong>${metrics.withWebsite}</strong>
          <span>${results.length ? `${Math.round((metrics.withWebsite / results.length) * 100)}% with website` : 'No rows yet'}</span>
        </article>
      </div>
    `;
  },

  renderResultsControls(results) {
    const selectedCount = this.getSelectionCount(results);
    const exportLabel = selectedCount ? `Export Selected (${selectedCount})` : `Export All (${results.length})`;

    return `
      <div class="results-toolbar">
        <div class="results-toolbar-main">
          <div class="field">
            <label for="gmPostSearch">Global search</label>
            <input id="gmPostSearch" type="text" value="${Utils.escapeHtml(this.postFilters.search)}" placeholder="Filter by name, address, phone, website, category">
          </div>
          <div class="results-summary-badges">
            <span class="badge results-count-badge">${results.length} current results</span>
            <span class="badge results-count-badge subtle">${this.sessionPool.length} in session pool</span>
          </div>
        </div>

        <div class="toolbar-actions">
          <button class="button secondary" id="gmNewSearch" ${this.currentResults.length ? '' : 'disabled'}>New Search</button>
          <button class="button secondary" id="gmAddToSession" ${this.currentResults.length ? '' : 'disabled'}>Add to Session</button>
          <button class="button secondary" id="gmSelectVisible" ${results.length ? '' : 'disabled'}>Select all</button>
          <button class="button secondary" id="gmDeselectVisible" ${selectedCount ? '' : 'disabled'}>Deselect all</button>
          <button class="button success" id="gmExportRows" ${results.length ? '' : 'disabled'}>${Utils.escapeHtml(exportLabel)}</button>
          <button class="button success" id="gmExportCsv" ${results.length ? '' : 'disabled'}>Export CSV</button>
        </div>
      </div>
    `;
  },

  renderCell(row, key) {
    if (key === 'name') {
      return `
        <div class="result-primary">
          <strong>${Utils.escapeHtml(row.name || '-')}</strong>
          <div class="result-meta-line mobile-only">
            <button class="button secondary mobile-details-btn" type="button" data-row-details="${row.id}">
              ${this.expandedRows.has(row.id) ? 'Hide Details' : 'Details'}
            </button>
          </div>
        </div>
      `;
    }

    if (key === 'website') {
      return row.website
        ? `<div class="website-cell">${this.renderWebsiteIndicator(row.websiteStatus)}<a class="link" href="${Utils.escapeHtml(row.website)}" target="_blank" rel="noopener">${Utils.escapeHtml(row.website)}</a></div>`
        : '-';
    }

    if (key === 'phone') {
      return row.phone ? `<a class="link" href="tel:${Utils.escapeHtml(row.phone)}">${Utils.escapeHtml(row.phone)}</a>` : '-';
    }

    if (key === 'rating') {
      return row.rating
        ? `<div class="rating-cell"><span class="rating-stars">${Utils.escapeHtml(this.renderStars(row.rating))}</span><span class="rating-value">${Utils.escapeHtml(Number(row.rating).toFixed(1))}</span></div>`
        : '-';
    }

    if (key === 'reviews') {
      return row.reviews ? Utils.formatNumber(row.reviews) : '-';
    }

    if (key === 'status') {
      return `<span class="status-pill-inline">${Utils.escapeHtml(this.formatStatus(row.status))}</span>`;
    }

    if (key === 'coordinates') {
      return Utils.escapeHtml(this.getResultCoordinates(row) || '-');
    }

    return Utils.escapeHtml(row[key] || '-');
  },

  renderResultsTable(results, visibleResults = this.getVisibleResults(results)) {
    if (!results.length) {
      return `
        <div class="empty-state">
          <p class="eyebrow">No rows</p>
          <h3>No Google Maps results yet</h3>
          <p>Run a search with a valid API key to populate the table.</p>
        </div>
      `;
    }

    const visibleColumns = this.getVisibleColumns();
    const headerMarkup = this.columnDefinitions
      .filter(([key]) => visibleColumns.includes(key))
      .map(([key, label]) => {
        const active = this.sortState.key === key;
        const indicator = active
          ? Utils.icon(this.sortState.direction === 'asc' ? 'arrow_upward' : 'arrow_downward')
          : Utils.icon('unfold_more');
        return `<th class="sortable ${active ? 'active' : ''}" data-sort="${key}">${Utils.escapeHtml(label)}<span class="sort-indicator">${indicator}</span></th>`;
      })
      .join('');

    const allVisibleSelected = visibleResults.length && visibleResults.every((row) => this.selectedIds.has(row.id));
    const startIndex = (this.pagination.page - 1) * this.pagination.pageSize;
    const endIndex = Math.min(startIndex + visibleResults.length, results.length);
    const totalPages = this.ensurePagination(results);

    const rows = visibleResults
      .map((row, index) => `
        <tr>
          <td><input class="table-checkbox" type="checkbox" data-row-check="${row.id}" ${this.selectedIds.has(row.id) ? 'checked' : ''}></td>
          <td>${startIndex + index + 1}</td>
          ${this.columnDefinitions
            .filter(([key]) => visibleColumns.includes(key))
            .map(([key]) => `<td>${this.renderCell(row, key)}</td>`)
            .join('')}
        </tr>
        <tr class="details-row ${this.expandedRows.has(row.id) ? '' : 'hidden'}" data-details-row="${row.id}">
          <td colspan="${visibleColumns.length + 2}">
            <div class="details-panel">
              <div><strong>Raw phone:</strong> ${Utils.escapeHtml(row.rawPhone || '-')}</div>
              <div><strong>Hours:</strong> ${Utils.escapeHtml(row.hours || '-')}</div>
              <div><strong>Status:</strong> ${Utils.escapeHtml(this.formatStatus(row.status))}</div>
              <div><strong>Coordinates:</strong> ${Utils.escapeHtml(this.getResultCoordinates(row) || '-')}</div>
            </div>
          </td>
        </tr>
      `)
      .join('');

    return `
      <div class="table-wrap maps-table-wrap">
        <table class="data-table data-table-wide">
          <thead>
            <tr>
              <th><input class="table-checkbox" id="gmSelectAll" type="checkbox" ${allVisibleSelected ? 'checked' : ''}></th>
              <th>#</th>
              ${headerMarkup}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="table-footer">
        <div class="table-footer-meta">Showing ${results.length ? startIndex + 1 : 0}-${endIndex} of ${results.length}</div>
        <div class="table-footer-actions">
          <button class="button secondary" id="gmPrevPage" ${this.pagination.page <= 1 ? 'disabled' : ''}>Prev</button>
          <span class="pagination-pill">Page ${this.pagination.page} of ${totalPages}</span>
          <button class="button secondary" id="gmNextPage" ${this.pagination.page >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
      </div>
    `;
  },

  setupEventListeners() {
    const radiusInput = document.getElementById('gmRadius');
    const radiusValue = document.getElementById('gmRadiusValue');
    if (radiusInput) {
      radiusInput.addEventListener('input', () => {
        radiusValue.textContent = `${Utils.formatNumber(radiusInput.value)} meters`;
      });
    }

    const minRatingInput = document.getElementById('gmMinRating');
    const minRatingValue = document.getElementById('gmMinRatingValue');
    if (minRatingInput) {
      minRatingInput.addEventListener('input', () => {
        minRatingValue.textContent = Number(minRatingInput.value).toFixed(1);
      });
    }

    const locationInput = document.getElementById('gmLocation');
    if (locationInput) {
      locationInput.addEventListener('input', (event) => {
        this.formState.location = event.target.value;
        window.clearTimeout(this.locationSearchTimer);
        this.locationSearchTimer = window.setTimeout(() => this.fetchLocationSuggestions(event.target.value), 300);
      });

      locationInput.addEventListener('keydown', (event) => {
        if (!this.autocomplete.open) return;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.autocomplete.activeIndex = Math.min(this.autocomplete.activeIndex + 1, this.autocomplete.items.length - 1);
          this.updateLocationSuggestions();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.autocomplete.activeIndex = Math.max(this.autocomplete.activeIndex - 1, 0);
          this.updateLocationSuggestions();
        } else if (event.key === 'Enter' && this.autocomplete.activeIndex >= 0) {
          event.preventDefault();
          this.selectLocationSuggestion(this.autocomplete.activeIndex);
        } else if (event.key === 'Escape') {
          this.closeLocationSuggestions();
        }
      });

      locationInput.addEventListener('blur', () => {
        window.setTimeout(() => {
          if (!document.activeElement?.closest?.('#location-autocomplete-dropdown')) {
            this.autocomplete = { ...this.autocomplete, open: false, activeIndex: -1 };
            this.updateLocationSuggestions();
          }
        }, 150);
      });
    }

    const categoryInput = document.getElementById('gmCategorySearch');
    if (categoryInput) {
      categoryInput.addEventListener('focus', () => {
        this.openCategoryDropdown();
        window.setTimeout(() => categoryInput.select(), 0);
      });
      categoryInput.addEventListener('click', () => this.openCategoryDropdown());
      categoryInput.addEventListener('input', (event) => {
        this.categoryAutocomplete = { ...this.categoryAutocomplete, open: true, activeIndex: 0, query: event.target.value };
        this.updateCategorySuggestions();
      });
      categoryInput.addEventListener('keydown', (event) => {
        const filtered = this.getFilteredCategories();
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.categoryAutocomplete.activeIndex = Math.min(this.categoryAutocomplete.activeIndex + 1, filtered.length - 1);
          this.updateCategorySuggestions();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.categoryAutocomplete.activeIndex = Math.max(this.categoryAutocomplete.activeIndex - 1, 0);
          this.updateCategorySuggestions();
        } else if (event.key === 'Enter' && filtered.length) {
          event.preventDefault();
          this.selectCategoryByIndex(this.categoryAutocomplete.activeIndex >= 0 ? this.categoryAutocomplete.activeIndex : 0);
        } else if (event.key === 'Escape') {
          this.closeCategoryDropdown(true);
        }
      });
      categoryInput.addEventListener('blur', () => {
        window.setTimeout(() => {
          if (!document.activeElement?.closest?.('#gmCategorySuggestions')) {
            this.closeCategoryDropdown(true);
          }
        }, 150);
      });
    }

    document.getElementById('gmRunSearch')?.addEventListener('click', () => this.startExtraction());
    document.getElementById('gmSaveSearch')?.addEventListener('click', () => this.saveSearch());
    document.getElementById('gmClearSeenCache')?.addEventListener('click', () => this.clearSeenPlaceCache());
    document.getElementById('gmResetForm')?.addEventListener('click', () => {
      this.formState = this.getDefaultFormState();
      this.postFilters = { search: '' };
      this.pagination.page = 1;
      this.templateMenuOpen = false;
      this.columnPickerOpen = false;
      this.lastSearchMeta = null;
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('gmTemplatesToggle')?.addEventListener('click', () => {
      this.templateMenuOpen = !this.templateMenuOpen;
      this.renderInto(document.getElementById('content'));
    });

    document.querySelectorAll('[data-template-index]').forEach((button) => {
      button.addEventListener('click', () => this.applyTemplate(Number(button.dataset.templateIndex)));
    });

    document.querySelectorAll('[data-saved-search]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (event.target.matches('[data-delete-saved-search]')) return;
        this.loadSavedSearch(Number(button.dataset.savedSearch));
      });
    });

    document.querySelectorAll('[data-delete-saved-search]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.deleteSavedSearch(Number(button.dataset.deleteSavedSearch));
      });
    });

    document.getElementById('gmColumnsToggle')?.addEventListener('click', () => {
      this.columnPickerOpen = !this.columnPickerOpen;
      this.renderInto(document.getElementById('content'));
    });

    document.querySelectorAll('[data-column-key]').forEach((input) => {
      input.addEventListener('change', (event) => this.toggleColumn(event.target.dataset.columnKey, event.target.checked));
    });

    document.getElementById('gmPostSearch')?.addEventListener('input', (event) => {
      this.postFilters.search = event.target.value;
      this.pagination.page = 1;
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('gmNewSearch')?.addEventListener('click', () => this.clearCurrentResults());
    document.getElementById('gmAddToSession')?.addEventListener('click', () => this.addCurrentToSession());
    document.getElementById('gmExportRows')?.addEventListener('click', async () => {
      const selectedOnly = this.selectedIds.size > 0;
      await Export.exportRows(this.getExportData(selectedOnly, 'xlsx'));
    });
    document.getElementById('gmExportCsv')?.addEventListener('click', async () => {
      const selectedOnly = this.selectedIds.size > 0;
      await Export.exportRows(this.getExportData(selectedOnly, 'csv'));
    });

    document.querySelectorAll('[data-sort]').forEach((header) => {
      header.addEventListener('click', () => {
        const key = header.dataset.sort;
        if (this.sortState.key === key) {
          this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortState = { key, direction: ['rating', 'reviews'].includes(key) ? 'desc' : 'asc' };
        }
        this.renderInto(document.getElementById('content'));
      });
    });

    document.getElementById('gmSelectAll')?.addEventListener('change', (event) => {
      const rows = this.getVisibleResults();
      if (event.target.checked) {
        rows.forEach((row) => this.selectedIds.add(row.id));
      } else {
        rows.forEach((row) => this.selectedIds.delete(row.id));
      }
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('gmSelectVisible')?.addEventListener('click', () => {
      this.getFilteredResults().forEach((row) => this.selectedIds.add(row.id));
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('gmDeselectVisible')?.addEventListener('click', () => {
      this.getFilteredResults().forEach((row) => this.selectedIds.delete(row.id));
      this.renderInto(document.getElementById('content'));
    });

    document.querySelectorAll('[data-row-check]').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const rowId = event.target.dataset.rowCheck;
        if (event.target.checked) {
          this.selectedIds.add(rowId);
        } else {
          this.selectedIds.delete(rowId);
        }
        this.renderInto(document.getElementById('content'));
      });
    });

    document.querySelectorAll('[data-row-details]').forEach((button) => {
      button.addEventListener('click', () => {
        this.toggleExpandedRow(button.dataset.rowDetails);
        this.renderInto(document.getElementById('content'));
      });
    });

    document.getElementById('gmPrevPage')?.addEventListener('click', () => {
      this.setPage(this.pagination.page - 1);
      this.renderInto(document.getElementById('content'));
    });

    document.getElementById('gmNextPage')?.addEventListener('click', () => {
      this.setPage(this.pagination.page + 1);
      this.renderInto(document.getElementById('content'));
    });

    this.updateLocationSuggestions();
    this.updateCategorySuggestions();
    this.updateCostDisplays();
  },

  async startExtraction() {
    const settings = Utils.getSettings();
    if (!settings.googleMapsEnabled) {
      Utils.showToast('Google Maps is disabled', 'Enable the platform from Settings first.', 'error');
      return;
    }

    this.syncFormState();

    if (!this.formState.keyword || !this.formState.location) {
      Utils.showToast('Missing search inputs', 'Keyword and location are both required.', 'error');
      return;
    }

    if (!settings.googleMapsApiKey) {
      Utils.showToast('Missing API key', 'Add a Google Maps API key in Settings.', 'error');
      Router.navigate('/settings');
      return;
    }

    const sessionId = Utils.createSessionId('maps');
    const plannedStrategy = Number(this.formState.maxResults) > 60
      ? `Using grid search to target ${this.formState.maxResults} results`
      : 'Using single search strategy';
    this.connectProgressStream(sessionId);
    App.Progress.start('Google Maps extraction', this.formState.maxResults, plannedStrategy);

    try {
      this.closeLocationSuggestions();
      this.closeCategoryDropdown(true);
      const cacheKey = this.getSeenCacheKey();
      const excludePlaceIds = this.formState.skipPreviouslyExtracted ? await this.getSeenPlaceIds(cacheKey) : [];

      const response = await Api.searchGoogleMaps({
        query: this.formState.keyword,
        keyword: this.formState.keyword,
        location: this.formState.location,
        radius: this.formState.radius,
        maxResults: this.formState.maxResults,
        category: this.formState.category,
        filters: this.formState.filters,
        apiKey: settings.googleMapsApiKey,
        sessionId,
        cacheKey,
        excludePlaceIds,
      });

      this.currentResults = (response.results || []).map((row, index) => ({
        ...row,
        index: index + 1,
        websiteStatus: row.websiteStatus || 'unchecked',
      }));
      this.lastSearchMeta = response.meta || null;
      this.lastRun = response.extraction || {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        source: 'Google Maps',
        count: this.currentResults.length,
        params: {
          keyword: this.formState.keyword,
          location: this.formState.location,
          category: this.formState.category,
          radius: this.formState.radius,
          maxResults: this.formState.maxResults,
          filters: this.formState.filters,
        },
        results: this.currentResults,
      };
      this.lastRunCost = Number(this.lastRun.cost?.inr || this.calculateCost(this.currentResults.length).total);
      this.sessionCostTotal += this.lastRunCost;
      await this.persistSeenPlaceIds(cacheKey, this.currentResults);
      this.resetSelection();
      this.expandedRows = new Set();
      this.pagination.page = 1;
      App.loadHistory(true).catch(() => {});
      App.Progress.finish(this.currentResults.length, `Loaded ${this.currentResults.length} rows`);
      Utils.showToast(
        'Extraction complete',
        `${this.currentResults.length} new places loaded. Skipped ${response.meta?.excludedSkipped || 0} seen and ${response.meta?.duplicatesSkipped || 0} duplicates.`,
        'success',
      );
      this.runWebsiteChecks().catch(() => {});
    } catch (error) {
      App.Progress.stop();
      Utils.showToast('Google Maps extraction failed', error.message, 'error');
    } finally {
      this.disconnectProgressStream();
      this.renderInto(document.getElementById('content'));
    }
  },

  renderInto(container) {
    if (!container) return;
    this.ensureClientState();
    this.ensurePagination();
    container.innerHTML = this.renderPage();
    this.setupEventListeners();
  },
};

window.GoogleMaps = GoogleMaps;
