const Export = {
  async exportRows({ data, source, mode, sheetName, filename, format = 'xlsx' }) {
    if (!data.length) {
      Utils.showToast('No rows to export', 'Run an extraction or select table rows first.', 'error');
      return;
    }

    const safeSource = Utils.slugify(source || 'results');
    const resolvedSheetName = sheetName || 'Google Maps Results';
    const extension = format === 'csv' ? 'csv' : 'xlsx';
    const resolvedFilename = filename || `${safeSource}_${mode}_${Utils.timestamp()}.${extension}`;

    try {
      const blob = format === 'csv'
        ? await Api.exportCsv(data, resolvedFilename)
        : await Api.exportExcel(data, resolvedSheetName, resolvedFilename);
      Utils.downloadBlob(blob, resolvedFilename);
      Utils.showToast(`Export ${format.toUpperCase()} ready`, `${data.length} rows downloaded as ${resolvedFilename}.`, 'success');
    } catch (error) {
      Utils.showToast('Export failed', error.message, 'error');
    }
  },
};

window.Export = Export;
