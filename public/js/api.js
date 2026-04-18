const Api = {
  baseUrl: '/api',

  async request(path, options = {}) {
    const token = Utils.getAuthToken();
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, config);
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await response.json() : await response.blob();

    if (!response.ok) {
      const message = isJson ? payload.error || payload.message || 'Request failed' : 'Request failed';
      const error = new Error(message);
      if (isJson && payload && typeof payload === 'object') {
        Object.assign(error, payload);
      }
      error.status = response.status;
      throw error;
    }

    return payload;
  },

  register(payload) {
    return this.request('/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  login(payload) {
    return this.request('/auth/login', {
      method: 'POST',
      body: payload,
    });
  },

  logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  },

  getCurrentUser() {
    return this.request('/auth/me');
  },

  getSettings() {
    return this.request('/settings');
  },

  getHistory() {
    return this.request('/history');
  },

  getActivity() {
    return this.request('/activity');
  },

  deleteHistoryItem(id) {
    return this.request(`/history/${id}`, {
      method: 'DELETE',
    });
  },

  saveSettings(settings) {
    return this.request('/settings', {
      method: 'POST',
      body: settings,
    });
  },

  validateGoogleApiKey(apiKey) {
    return this.request('/settings/validate-google', {
      method: 'POST',
      body: { apiKey },
    });
  },

  validateLinkedInApiKey(apiKey) {
    return this.request('/settings/validate-linkedin', {
      method: 'POST',
      body: { apiKey },
    });
  },

  searchGoogleMaps(params) {
    return this.request('/maps/search', {
      method: 'POST',
      body: params,
    });
  },

  getMapsSeenSession(cacheKey) {
    const params = new URLSearchParams({ cacheKey });
    return this.request(`/maps/session/seen?${params.toString()}`);
  },

  saveMapsSeenSession(cacheKey, placeIds) {
    return this.request('/maps/session/seen', {
      method: 'POST',
      body: { cacheKey, placeIds },
    });
  },

  createMapsProgressStream(sessionId) {
    const params = new URLSearchParams();
    const token = Utils.getAuthToken();
    if (token) params.set('token', token);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return new EventSource(`${this.baseUrl}/maps/search/progress/${encodeURIComponent(sessionId)}${suffix}`);
  },

  getGoogleLocationSuggestions(query, apiKey) {
    const params = new URLSearchParams({ query });
    if (apiKey) params.set('apiKey', apiKey);
    return this.request(`/maps/location-suggestions?${params.toString()}`);
  },

  searchLinkedIn(params) {
    return this.request('/linkedin/search', {
      method: 'POST',
      body: params,
    });
  },

  exportExcel(data, sheetName, filename) {
    return this.request('/export', {
      method: 'POST',
      body: { data, sheetName, filename },
    });
  },

  exportCsv(data, filename) {
    return this.request('/export/csv', {
      method: 'POST',
      body: { data, filename },
    });
  },

  checkUrl(url) {
    const params = new URLSearchParams({ url });
    return this.request(`/check-url?${params.toString()}`);
  },
};

window.Api = Api;
