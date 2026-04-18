const Utils = {
  settingsKey: 'superDataExtractor.settings',
  authTokenKey: 'sde_auth_token',
  currentUserKey: 'sde_current_user',
  themeKey: 'sde_theme',
  historyKey: 'superDataExtractor.history',
  savedSearchesKey: 'sde_saved_searches',
  mapsColumnsKey: 'sde_maps_columns',
  mapsSeenPlacesKey: 'sde_maps_seen_places',
  defaultSettings: {
    theme: 'light',
    googleMapsApiKey: '',
    linkedinApiKey: '',
    googleMapsEnabled: true,
    linkedinEnabled: true,
    validations: {
      googleMaps: {
        status: null,
        lastValidatedAt: null,
      },
      linkedin: {
        status: null,
        lastValidatedAt: null,
      },
    },
  },

  getSettings() {
    const stored = localStorage.getItem(this.settingsKey);
    if (!stored) {
      this.saveSettings(this.defaultSettings);
      return structuredClone(this.defaultSettings);
    }

    try {
      const parsed = JSON.parse(stored);
      const merged = {
        ...structuredClone(this.defaultSettings),
        ...parsed,
        validations: {
          ...structuredClone(this.defaultSettings).validations,
          ...(parsed.validations || {}),
          googleMaps: {
            ...structuredClone(this.defaultSettings).validations.googleMaps,
            ...(parsed.validations?.googleMaps || {}),
          },
          linkedin: {
            ...structuredClone(this.defaultSettings).validations.linkedin,
            ...(parsed.validations?.linkedin || {}),
          },
        },
      };
      return merged;
    } catch (error) {
      this.saveSettings(this.defaultSettings);
      return structuredClone(this.defaultSettings);
    }
  },

  saveSettings(settings) {
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    if (settings?.theme) {
      localStorage.setItem(this.themeKey, settings.theme);
    }
    return settings;
  },

  getThemePreference() {
    return localStorage.getItem(this.themeKey) || this.getSettings().theme || this.defaultSettings.theme;
  },

  saveThemePreference(theme) {
    localStorage.setItem(this.themeKey, theme);
    const settings = this.getSettings();
    settings.theme = theme;
    this.saveSettings(settings);
    return theme;
  },

  getHistory() {
    const stored = localStorage.getItem(this.historyKey);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch (error) {
      return [];
    }
  },

  saveHistory(history) {
    localStorage.setItem(this.historyKey, JSON.stringify(history.slice(0, 50)));
    return history;
  },

  appendHistory(entry) {
    const history = this.getHistory();
    history.unshift(entry);
    this.saveHistory(history);
    return history;
  },

  clearAll() {
    localStorage.removeItem(this.settingsKey);
    localStorage.removeItem(this.authTokenKey);
    localStorage.removeItem(this.currentUserKey);
    localStorage.removeItem(this.historyKey);
    localStorage.removeItem(this.savedSearchesKey);
    localStorage.removeItem(this.mapsColumnsKey);
    localStorage.removeItem(this.mapsSeenPlacesKey);
    localStorage.removeItem(this.themeKey);
  },

  getSavedSearches() {
    const stored = localStorage.getItem(this.savedSearchesKey);
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  },

  saveSavedSearches(searches) {
    const normalized = Array.isArray(searches) ? searches.slice(0, 10) : [];
    localStorage.setItem(this.savedSearchesKey, JSON.stringify(normalized));
    return normalized;
  },

  getMapsColumnPrefs(defaultColumns = []) {
    const stored = localStorage.getItem(this.mapsColumnsKey);
    if (!stored) return [...defaultColumns];

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length ? parsed : [...defaultColumns];
    } catch (error) {
      return [...defaultColumns];
    }
  },

  saveMapsColumnPrefs(columns) {
    const normalized = Array.isArray(columns) ? columns : [];
    localStorage.setItem(this.mapsColumnsKey, JSON.stringify(normalized));
    return normalized;
  },

  buildMapsSeenCacheKey(keyword = '', location = '') {
    return `${String(keyword || '').trim().toLowerCase()}::${String(location || '').trim().toLowerCase()}`;
  },

  getMapsSeenPlaces() {
    const stored = localStorage.getItem(this.mapsSeenPlacesKey);
    if (!stored) return {};

    try {
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  },

  getMapsSeenPlaceIds(cacheKey = '') {
    if (!cacheKey) return [];
    const store = this.getMapsSeenPlaces();
    const entry = store[cacheKey];
    return Array.isArray(entry?.placeIds) ? entry.placeIds : [];
  },

  saveMapsSeenPlaceIds(cacheKey = '', placeIds = []) {
    if (!cacheKey) return [];
    const store = this.getMapsSeenPlaces();
    const existing = new Set(Array.isArray(store[cacheKey]?.placeIds) ? store[cacheKey].placeIds : []);
    for (const placeId of Array.isArray(placeIds) ? placeIds : []) {
      if (placeId) existing.add(String(placeId));
    }
    store[cacheKey] = {
      placeIds: Array.from(existing),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.mapsSeenPlacesKey, JSON.stringify(store));
    return store[cacheKey].placeIds;
  },

  clearMapsSeenPlaceIds(cacheKey = '') {
    if (!cacheKey) {
      localStorage.removeItem(this.mapsSeenPlacesKey);
      return;
    }
    const store = this.getMapsSeenPlaces();
    delete store[cacheKey];
    localStorage.setItem(this.mapsSeenPlacesKey, JSON.stringify(store));
  },

  formatDate(value) {
    const date = new Date(value);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  },

  relativeTime(value) {
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
    return `${Math.round(minutes / 1440)}d ago`;
  },

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  },

  icon(name, extraClass = '') {
    const className = extraClass ? `icon ${extraClass}` : 'icon';
    return `<span class="${className}" aria-hidden="true">${this.escapeHtml(name)}</span>`;
  },

  slugify(value) {
    return String(value || 'export')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  },

  timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  },

  formatNumber(value) {
    if (value === '' || value == null || Number.isNaN(Number(value))) return '-';
    return new Intl.NumberFormat('en-US').format(Number(value));
  },

  formatCurrencyInr(value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  },

  formatPercent(part, total) {
    if (!total) return 0;
    return Math.min(Math.round((part / total) * 100), 100);
  },

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  parseNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },

  getAuthToken() {
    return localStorage.getItem(this.authTokenKey) || '';
  },

  saveAuthToken(token) {
    if (!token) {
      localStorage.removeItem(this.authTokenKey);
      return '';
    }
    localStorage.setItem(this.authTokenKey, token);
    return token;
  },

  clearAuthToken() {
    localStorage.removeItem(this.authTokenKey);
  },

  getCurrentUser() {
    const stored = localStorage.getItem(this.currentUserKey);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  },

  saveCurrentUser(user) {
    if (!user) {
      localStorage.removeItem(this.currentUserKey);
      return null;
    }
    localStorage.setItem(this.currentUserKey, JSON.stringify(user));
    return user;
  },

  clearCurrentUser() {
    localStorage.removeItem(this.currentUserKey);
  },

  clearSession() {
    this.clearAuthToken();
    this.clearCurrentUser();
  },

  getInitials(name = '') {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!parts.length) return 'SD';
    return parts.map((part) => part[0]?.toUpperCase() || '').join('');
  },

  pickExportRows(results, selectedIds) {
    if (!selectedIds || !selectedIds.size) return results;
    return results.filter((item) => selectedIds.has(item.id || item.placeId || item.profileUrl));
  },

  isGoogleMapsConfigured(settings = this.getSettings()) {
    return Boolean(settings.googleMapsEnabled && settings.googleMapsApiKey);
  },

  isLinkedInConfigured(settings = this.getSettings()) {
    return Boolean(settings.linkedinEnabled && settings.linkedinApiKey);
  },

  getValidationState(serviceKey, settings = this.getSettings()) {
    return settings.validations?.[serviceKey] || { status: null, lastValidatedAt: null };
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  createSessionId(prefix = 'session') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  },

  showToast(title, message = '', type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('article');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<strong>${this.escapeHtml(title)}</strong><p>${this.escapeHtml(message)}</p>`;
    container.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 3800);
  },
};

window.Utils = Utils;
