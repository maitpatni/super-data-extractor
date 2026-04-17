const express = require('express');
const cors = require('cors');
const path = require('path');
const xlsx = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let extractionHistory = [];
let settings = {
  googleMapsApiKey: '',
  linkedinApiKey: '',
  linkedinUsername: '',
  linkedinPassword: '',
  theme: 'dark',
  googleMapsEnabled: true,
  linkedinEnabled: true
};

app.get('/api/settings', (req, res) => {
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  settings = { ...settings, ...newSettings };
  res.json({ success: true, settings });
});

app.post('/api/settings/validate-google', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.json({ valid: false, error: 'API key is required' });
  }
  try {
    const testUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=test&key=${apiKey}`;
    const response = await fetch(testUrl);
    const data = await response.json();
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      res.json({ valid: true });
    } else {
      res.json({ valid: false, error: data.status });
    }
  } catch (error) {
    res.json({ valid: false, error: error.message });
  }
});

app.post('/api/google-maps/search', async (req, res) => {
  const { keyword, location, radius, category, maxResults, filters, apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  const results = [];
  const pages = Math.ceil(maxResults / 20);
  let nextPageToken = null;

  try {
    for (let page = 0; page < pages; page++) {
      const currentMax = Math.min(20, maxResults - results.length);
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword + ' ' + location)}&key=${apiKey}&maxresults=${currentMax}`;
      
      if (radius) url += `&radius=${radius}`;
      if (category) url += `&type=${category}`;
      if (nextPageToken) url += `&pagetoken=${nextPageToken}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(data.status);
      }

      for (const place of data.results) {
        if (results.length >= maxResults) break;
        
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,opening_hours,geometry&key=${apiKey}`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();
        const details = detailData.result || {};

        let passesFilters = true;
        if (filters) {
          if (filters.hasPhone && !details.formatted_phone_number) passesFilters = false;
          if (filters.hasWebsite && !details.website) passesFilters = false;
          if (filters.minRating && (!details.rating || details.rating < filters.minRating)) passesFilters = false;
          if (filters.hasReviews && (!details.user_ratings_total || details.user_ratings_total === 0)) passesFilters = false;
        }

        if (passesFilters) {
          results.push({
            name: details.name || place.name,
            address: details.formatted_address || place.formatted_address,
            phone: details.formatted_phone_number || '',
            website: details.website || '',
            rating: details.rating || place.rating || '',
            reviews: details.user_ratings_total || place.user_ratings_total || '',
            category: (details.types && details.types[0]) || (place.types && place.types[0]) || '',
            openingHours: details.opening_hours ? (details.opening_hours.open_now !== undefined ? (details.opening_hours.open_now ? 'Open' : 'Closed') : '') : '',
            location: details.geometry ? `${details.geometry.location.lat},${details.geometry.location.lng}` : '',
            placeId: place.place_id
          });
        }

        if (results.length >= maxResults) break;
      }

      if (data.next_page_token) {
        nextPageToken = data.next_page_token;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }

    const extraction = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      source: 'Google Maps',
      count: results.length,
      status: 'completed',
      results: results
    };
    
    extractionHistory.unshift(extraction);
    if (extractionHistory.length > 50) extractionHistory.pop();

    res.json({ success: true, results, extraction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/linkedin/search', async (req, res) => {
  const { name, company, role, location, industry, filters } = req.body;
  
  const demoProfiles = [
    { name: 'John Smith', headline: 'Software Engineer at Google', company: 'Google', jobTitle: 'Software Engineer', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/johnsmith', connectionDegree: '1st' },
    { name: 'Sarah Johnson', headline: 'Marketing Director at Meta', company: 'Meta', jobTitle: 'Marketing Director', location: 'Menlo Park, CA', profileUrl: 'https://linkedin.com/in/sarahjohnson', connectionDegree: '1st' },
    { name: 'Michael Chen', headline: 'Product Manager at Apple', company: 'Apple', jobTitle: 'Product Manager', location: 'Cupertino, CA', profileUrl: 'https://linkedin.com/in/michaelchen', connectionDegree: '2nd' },
    { name: 'Emily Davis', headline: 'Data Scientist at Netflix', company: 'Netflix', jobTitle: 'Data Scientist', location: 'Los Gatos, CA', profileUrl: 'https://linkedin.com/in/emilydavis', connectionDegree: '1st' },
    { name: 'Robert Wilson', headline: 'Engineering Manager at Amazon', company: 'Amazon', jobTitle: 'Engineering Manager', location: 'Seattle, WA', profileUrl: 'https://linkedin.com/in/robertwilson', connectionDegree: '2nd' },
    { name: 'Lisa Anderson', headline: 'UX Designer at Adobe', company: 'Adobe', jobTitle: 'UX Designer', location: 'San Jose, CA', profileUrl: 'https://linkedin.com/in/lisaanderson', connectionDegree: '1st' },
    { name: 'David Brown', headline: 'DevOps Engineer at Microsoft', company: 'Microsoft', jobTitle: 'DevOps Engineer', location: 'Redmond, WA', profileUrl: 'https://linkedin.com/in/davidbrown', connectionDegree: '2nd' },
    { name: 'Jennifer Lee', headline: 'HR Director at Tesla', company: 'Tesla', jobTitle: 'HR Director', location: 'Palo Alto, CA', profileUrl: 'https://linkedin.com/in/jenniferlee', connectionDegree: '1st' },
    { name: 'Christopher Martinez', headline: 'Business Analyst at Stripe', company: 'Stripe', jobTitle: 'Business Analyst', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/chrismartinez', connectionDegree: '1st' },
    { name: 'Amanda Taylor', headline: 'Sales Lead at Salesforce', company: 'Salesforce', jobTitle: 'Sales Lead', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/amandataylor', connectionDegree: '2nd' },
    { name: 'James Garcia', headline: 'AI Researcher at OpenAI', company: 'OpenAI', jobTitle: 'AI Researcher', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/jamesgarcia', connectionDegree: '1st' },
    { name: 'Michelle Wang', headline: 'Frontend Developer at Airbnb', company: 'Airbnb', jobTitle: 'Frontend Developer', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/michellewang', connectionDegree: '1st' },
    { name: 'Kevin Johnson', headline: 'Backend Engineer at Uber', company: 'Uber', jobTitle: 'Backend Engineer', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/kevinjohnson', connectionDegree: '2nd' },
    { name: 'Rachel White', headline: 'Tech Lead at Snap', company: 'Snap', jobTitle: 'Tech Lead', location: 'Santa Monica, CA', profileUrl: 'https://linkedin.com/in/rachelwhite', connectionDegree: '1st' },
    { name: 'Daniel Kim', headline: 'Security Engineer at Coinbase', company: 'Coinbase', jobTitle: 'Security Engineer', location: 'San Francisco, CA', profileUrl: 'https://linkedin.com/in/danielkim', connectionDegree: '1st' }
  ];

  let filteredProfiles = demoProfiles;

  if (name) {
    filteredProfiles = filteredProfiles(p => p.name.toLowerCase().includes(name.toLowerCase()));
  }
  if (company) {
    filteredProfiles = filteredProfiles.filter(p => p.company.toLowerCase().includes(company.toLowerCase()));
  }
  if (role) {
    filteredProfiles = filteredProfiles.filter(p => p.jobTitle.toLowerCase().includes(role.toLowerCase()) || p.headline.toLowerCase().includes(role.toLowerCase()));
  }
  if (location) {
    filteredProfiles = filteredProfiles.filter(p => p.location.toLowerCase().includes(location.toLowerCase()));
  }
  if (industry) {
    filteredProfiles = filteredProfiles.filter(p => p.company.toLowerCase().includes(industry.toLowerCase()));
  }

  const extraction = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    source: 'LinkedIn',
    count: filteredProfiles.length,
    status: 'completed',
    results: filteredProfiles
  };

  extractionHistory.unshift(extraction);
  if (extractionHistory.length > 50) extractionHistory.pop();

  res.json({ success: true, results: filteredProfiles, extraction });
});

app.get('/api/history', (req, res) => {
  res.json(extractionHistory);
});

app.delete('/api/history/:id', (req, res) => {
  const { id } = req.params;
  extractionHistory = extractionHistory.filter(h => h.id !== parseInt(id));
  res.json({ success: true });
});

app.post('/api/export', (req, res) => {
  const { data, sheetName, filename } = req.body;
  
  try {
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName || 'Data');
    
    const colWidths = [];
    const headers = Object.keys(data[0] || {});
    headers.forEach(header => {
      const maxLength = Math.max(
        header.length,
        ...data.map(row => String(row[header] || '').length)
      );
      colWidths.push({ wch: Math.min(maxLength + 2, 50) });
    });
    worksheet['!cols'] = colWidths;

    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export.xlsx'}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Super Data Extractor running at http://localhost:${PORT}`);
});