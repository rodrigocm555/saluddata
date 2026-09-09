import Papa from 'papaparse';

export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

export const analyzeColumns = (data) => {
  if (!data || data.length === 0) return { numeric: [], categorical: [] };

  const columns = Object.keys(data[0]);
  const numeric = [];
  const categorical = [];

  columns.forEach(column => {
    const values = data.map(row => row[column]).filter(val => val !== null && val !== '');
    const numericCount = values.filter(val => !isNaN(parseFloat(val))).length;
    
    if (numericCount > values.length * 0.7) {
      numeric.push(column);
    } else {
      categorical.push(column);
    }
  });

  return { numeric, categorical };
};

export const generateChartData = (data, column, type = 'categorical') => {
  if (!data || data.length === 0) return [];

  if (type === 'categorical') {
    const counts = {};
    data.forEach(row => {
      const value = row[column] || 'Sin dato';
      counts[value] = (counts[value] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  } else {
    const values = data
      .map(row => parseFloat(row[column]))
      .filter(val => !isNaN(val));

    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / 5 || 1;

    const ranges = [];
    for (let i = 0; i < 5; i++) {
      const rangeMin = min + (i * step);
      const rangeMax = min + ((i + 1) * step);
      const label = `${rangeMin.toFixed(1)} - ${rangeMax.toFixed(1)}`;
      
      const count = values.filter(val => val >= rangeMin && val < rangeMax).length;
      ranges.push({ label, value: count });
    }

    return ranges;
  }
};

export const saveModuleCSV = (moduloId, csvData) => {
  const key = `modulo_csv_${moduloId}`;
  
  try {
    const { numeric, categorical } = analyzeColumns(csvData);
    const aggregatedData = {
      columns: { numeric, categorical },
      summary: {
        totalRows: csvData.length,
        columnTypes: Object.keys(csvData[0] || {}).reduce((acc, col) => {
          acc[col] = numeric.includes(col) ? 'numeric' : 'categorical';
          return acc;
        }, {})
      },
      sampleData: csvData.slice(0, 5) // Guardar solo 5 filas de muestra
    };
    
    localStorage.setItem(key, JSON.stringify(aggregatedData));
    return { success: true };
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      return { 
        success: false, 
        error: 'El archivo es demasiado grande. Intenta con un CSV más pequeño o con menos columnas.' 
      };
    }
    return { success: false, error: 'Error al guardar los datos: ' + error.message };
  }
};

export const getModuleCSV = (moduloId) => {
  const key = `modulo_csv_${moduloId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
};

export const hasModuleCSV = (moduloId) => {
  const key = `modulo_csv_${moduloId}`;
  return localStorage.getItem(key) !== null;
};