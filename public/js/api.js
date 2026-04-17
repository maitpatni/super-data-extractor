const Api = {
  baseUrl: '/api',

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async getSettings() {
    return this.request('/settings');
  },

  async saveSettings(settings) {
    return this.request('/settings', {
      method: 'POST',
      body: settings
    });
  },

  async validateGoogleApiKey(apiKey) {
    return this.request('/settings/validate-google', {
      method: 'POST',
      body: { apiKey }
    });
  },

  async searchGoogleMaps(params) {
    return this.request('/google-maps/search', {
      method: 'POST',
      body: params
    });
  },

  async searchLinkedIn(params) {
    return this.request('/linkedin/search', {
      method: 'POST',
      body: params
    });
  },

  async getHistory() {
    return this.request('/history');
  },

  async deleteHistoryItem(id) {
    return this.request(`/history/${id}`, {
      method: 'DELETE'
    });
  },

  async exportToExcel(data, sheetName, filename) {
    try {
      const response = await fetch(`${this.baseUrl}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data, sheetName, filename })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'export.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      throw error;
    }
  }
};

window.Api = Api;