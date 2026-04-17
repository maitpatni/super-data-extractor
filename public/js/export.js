const Export = {
  exportToXlsx(data, filename, sheetName = 'Data') {
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      
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

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultFilename = `${filename || 'export'}_${timestamp}.xlsx`;
      
      XLSX.writeFile(workbook, defaultFilename);
      
      Utils.showToast('Export completed successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      Utils.showToast('Export failed: ' + error.message, 'error');
    }
  },

  exportGoogleMapsResults(results) {
    const data = results.map(item => ({
      'Name': item.name || '',
      'Address': item.address || '',
      'Phone': item.phone || '',
      'Website': item.website || '',
      'Rating': item.rating || '',
      'Reviews': item.reviews || '',
      'Category': item.category || '',
      'Opening Hours': item.openingHours || '',
      'Location': item.location || '',
      'Place ID': item.placeId || ''
    }));

    this.exportToXlsx(data, 'google_maps_results', 'Google Maps');
  },

  exportLinkedInResults(results) {
    const data = results.map(item => ({
      'Name': item.name || '',
      'Headline': item.headline || '',
      'Company': item.company || '',
      'Job Title': item.jobTitle || '',
      'Location': item.location || '',
      'Profile URL': item.profileUrl || '',
      'Connection Degree': item.connectionDegree || ''
    }));

    this.exportToXlsx(data, 'linkedin_results', 'LinkedIn');
  },

  exportToBrowser(data, filename) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const exportFilename = `${filename || 'export'}_${timestamp}.xlsx`;
    
    XLSX.writeFile(workbook, exportFilename);
  }
};

window.Export = Export;