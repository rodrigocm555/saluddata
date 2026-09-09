import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../api";
import { modulos } from "../mocks/modulosMock";
import { parseCSV, analyzeColumns, generateChartData, saveModuleCSV, getModuleCSV, hasModuleCSV } from "../utils/csvParser";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function ModuloDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const isAdmin = user?.role === 'Administrador';
  
  const [modulo, setModulo] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    const moduloEncontrado = modulos.find(m => m.id === parseInt(id));
    if (!moduloEncontrado) {
      navigate('/modulos');
      return;
    }
    setModulo(moduloEncontrado);

    if (hasModuleCSV(parseInt(id))) {
      const savedData = getModuleCSV(parseInt(id));
      if (savedData && savedData.sampleData) {
        setCsvData(savedData.sampleData);
        generateCharts(savedData.sampleData);
      }
    }
  }, [id, navigate]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Por favor sube un archivo CSV');
      return;
    }

    setLoading(true);
    setError(null);
    setSaveError(null);

    try {
      const data = await parseCSV(file);
      if (data.length === 0) {
        setError('El archivo CSV está vacío');
        setLoading(false);
        return;
      }

      setCsvData(data);
      
      const saveResult = saveModuleCSV(parseInt(id), data);
      if (!saveResult.success) {
        setSaveError(saveResult.error);
        // No bloqueamos el flujo, permitimos ver las gráficas aunque no se guarden
      }
      
      generateCharts(data);
    } catch (err) {
      setError('Error al procesar el archivo CSV: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateCharts = (data) => {
    if (!data || data.length === 0) {
      setChartData([]);
      return;
    }

    try {
      const { numeric, categorical } = analyzeColumns(data);
      const charts = [];

      if (categorical.length > 0) {
        const catColumn = categorical[0];
        const catData = generateChartData(data, catColumn, 'categorical');
        if (catData && catData.length > 0) {
          charts.push({
            type: 'bar',
            title: `Distribución por ${catColumn}`,
            data: catData,
            labels: catData.map(d => d.label),
            values: catData.map(d => d.value)
          });
        }
      }

      if (numeric.length > 0) {
        const numColumn = numeric[0];
        const numData = generateChartData(data, numColumn, 'numeric');
        if (numData && numData.length > 0) {
          charts.push({
            type: 'pie',
            title: `Distribución de ${numColumn}`,
            data: numData,
            labels: numData.map(d => d.label),
            values: numData.map(d => d.value)
          });
        }
      }

      if (categorical.length > 1) {
        const catColumn2 = categorical[1];
        const catData2 = generateChartData(data, catColumn2, 'categorical');
        if (catData2 && catData2.length > 0) {
          charts.push({
            type: 'line',
            title: `Tendencia de ${catColumn2}`,
            data: catData2,
            labels: catData2.map(d => d.label),
            values: catData2.map(d => d.value)
          });
        }
      }

      setChartData(charts);
    } catch (err) {
      console.error('Error generando gráficas:', err);
      setChartData([]);
    }
  };

  const getChartColors = (index) => {
    const colors = [
      ['#0e7490', '#14b8a6', '#0284c7', '#0891b2', '#06b6d4'],
      ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6'],
      ['#10b981', '#22c55e', '#84cc16', '#eab308', '#f43f5e']
    ];
    return colors[index % colors.length];
  };

  const renderChart = (chart, index) => {
    const colors = getChartColors(index);
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
      },
    };

    const chartConfig = {
      labels: chart.labels,
      datasets: [
        {
          label: chart.title,
          data: chart.values,
          backgroundColor: colors,
          borderColor: colors.map(c => c),
          borderWidth: 1,
        },
      ],
    };

    switch (chart.type) {
      case 'bar':
        return (
          <div key={index} className="chart-card">
            <h4>{chart.title}</h4>
            <div style={{ height: '250px' }}>
              <Bar data={chartConfig} options={commonOptions} />
            </div>
          </div>
        );
      case 'pie':
        return (
          <div key={index} className="chart-card">
            <h4>{chart.title}</h4>
            <div style={{ height: '250px' }}>
              <Pie data={chartConfig} options={commonOptions} />
            </div>
          </div>
        );
      case 'line':
        return (
          <div key={index} className="chart-card">
            <h4>{chart.title}</h4>
            <div style={{ height: '250px' }}>
              <Line data={chartConfig} options={commonOptions} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!modulo) return null;

  return (
    <div style={{ padding: '24px', backgroundColor: '#f4f9fb', minHeight: '100vh', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#0f4c5c', margin: 0, fontSize: '26px' }}>Módulo: {modulo.titulo}</h1>
        <p style={{ color: '#5a738e', margin: '4px 0 0 0', fontSize: '14px' }}>
          {modulo.descripcion}
        </p>
      </div>

      <div style={{ 
        background: 'white', 
        border: '1px solid #dbe7ec', 
        borderRadius: '15px', 
        padding: '22px',
        boxShadow: '0 3px 10px rgba(15, 23, 42, .03)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#0f4c5c' }}>{modulo.titulo}</h3>
            <p style={{ color: '#64748b', margin: '3px 0 0', fontSize: '12px' }}>
              Código: {modulo.codigo} | Instructor: {modulo.instructor} | Estado: {modulo.estado}
            </p>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div style={{ 
          background: 'white', 
          border: '1px solid #dbe7ec', 
          borderRadius: '15px', 
          padding: '22px',
          boxShadow: '0 3px 10px rgba(15, 23, 42, .03)',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#0f4c5c' }}>Cargar CSV para Análisis</h3>
          </div>
          <div style={{ 
            border: '2px dashed #7dd3fc', 
            borderRadius: '12px', 
            padding: '30px', 
            textAlign: 'center', 
            background: '#f0f9ff',
            minHeight: '200px'
          }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={loading}
              id="csv-input"
              style={{ display: 'none' }}
            />
            <label 
              htmlFor="csv-input" 
              style={{ 
                background: '#0e7490', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                padding: '10px 20px', 
                cursor: 'pointer', 
                fontWeight: '600', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px'
              }}
            >
              {loading ? 'Procesando...' : 'Seleccionar archivo CSV'}
            </label>
            <p style={{ color: '#64748b', margin: '10px 0 15px' }}>
              Sube un archivo CSV para generar gráficas automáticas
            </p>
            {error && <p style={{ color: '#dc2626', marginTop: '10px' }}>{error}</p>}
            {saveError && <p style={{ color: '#dc2626', marginTop: '10px' }}>{saveError}</p>}
          </div>
        </div>
      )}

      {!csvData && (
        <div style={{ 
          background: 'white', 
          border: '1px solid #dbe7ec', 
          borderRadius: '15px', 
          padding: '40px',
          boxShadow: '0 3px 10px rgba(15, 23, 42, .03)',
          textAlign: 'center',
          marginBottom: '20px'
        }}>
          <p style={{ color: '#64748b' }}>
            {isAdmin ? 'Sube un archivo CSV para comenzar el análisis' : 'El administrador cargará los datos pronto'}
          </p>
        </div>
      )}

      {csvData && chartData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginBottom: '15px', color: '#0f4c5c' }}>Análisis de Datos</h3>
          </div>
          {chartData.map((chart, index) => (
            <div key={index} style={{ 
              background: 'white', 
              border: '1px solid #dbe7ec', 
              borderRadius: '15px', 
              padding: '22px',
              boxShadow: '0 3px 10px rgba(15, 23, 42, .03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f4c5c' }}>{chart.title}</h3>
              </div>
              <div style={{ height: '250px' }}>
                {renderChart(chart, index)}
              </div>
            </div>
          ))}
        </div>
      )}

      {csvData && chartData.length === 0 && (
        <div style={{ 
          background: 'white', 
          border: '1px solid #dbe7ec', 
          borderRadius: '15px', 
          padding: '40px',
          boxShadow: '0 3px 10px rgba(15, 23, 42, .03)',
          textAlign: 'center'
        }}>
          <p style={{ color: '#64748b' }}>
            El CSV no contiene datos suficientes para generar visualizaciones
          </p>
        </div>
      )}
    </div>
  );
}

export default ModuloDetalle;