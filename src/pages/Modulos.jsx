import { Link } from "react-router-dom";
import { getCurrentUser } from "../api";
import { modulos } from "../mocks/modulosMock";
import { getModulosForUsuario } from "../mocks/permisosMock";

function Modulos() {
  const user = getCurrentUser();
  const modulosFiltrados = getModulosForUsuario(user?.id || 0, user?.role || 'Analista');

  const getGradientForIndex = (index) => {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f4f9fb', minHeight: '100vh', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#0f4c5c', margin: 0, fontSize: '26px' }}>Módulos de Formación</h1>
        <p style={{ color: '#5a738e', margin: '4px 0 0 0', fontSize: '14px' }}>
          Cursos y módulos de capacitación disponibles
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {modulosFiltrados.map((modulo, index) => (
          <Link 
            key={modulo.id} 
            to={`/modulos/${modulo.id}`} 
            style={{ 
              background: 'white', 
              border: '1px solid #dbe7ec', 
              borderRadius: '15px', 
              overflow: 'hidden', 
              textDecoration: 'none', 
              color: 'inherit', 
              transition: 'transform 0.2s, box-shadow 0.2s', 
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(15, 23, 42, .03)',
              display: 'block'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(15, 23, 42, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 3px 10px rgba(15, 23, 42, .03)';
            }}
          >
            <div 
              style={{ 
                height: '120px', 
                display: 'flex', 
                alignItems: 'flex-start', 
                justifyContent: 'flex-end', 
                padding: '15px', 
                position: 'relative',
                background: getGradientForIndex(index)
              }}
            >
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.9)', 
                color: '#0f4c5c', 
                padding: '6px 12px', 
                borderRadius: '20px', 
                fontSize: '11px', 
                fontWeight: '700',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}>
                {modulo.codigo}
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              <h3 style={{ 
                margin: '0 0 15px', 
                fontSize: '15px', 
                lineHeight: '1.4', 
                color: '#172033',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {modulo.titulo}
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ 
                  padding: '5px 12px', 
                  borderRadius: '15px', 
                  fontSize: '11px', 
                  fontWeight: '700',
                  backgroundColor: modulo.estado === 'Abierto' ? '#dcfce7' : '#fee2e2',
                  color: modulo.estado === 'Abierto' ? '#15803d' : '#dc2626'
                }}>
                  {modulo.estado}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', textAlign: 'right' }}>
                  {modulo.instructor}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {modulosFiltrados.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 20px', 
          color: '#64748b', 
          background: 'white', 
          border: '1px solid #dbe7ec', 
          borderRadius: '15px',
          boxShadow: '0 3px 10px rgba(15, 23, 42, .03)'
        }}>
          <p>No tienes acceso a ningún módulo. Contacta al administrador.</p>
        </div>
      )}
    </div>
  );
}

export default Modulos;