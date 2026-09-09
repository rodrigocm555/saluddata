import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../api";
import { usuariosMock, permisosMock, updatePermisosForUsuario } from "../mocks/permisosMock";
import { modulos } from "../mocks/modulosMock";

function Permisos() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  
  const [permisosLocales, setPermisosLocales] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (user?.role !== 'Administrador') {
      navigate('/');
      return;
    }

    const permisosIniciales = {};
    usuariosMock.forEach(usuario => {
      if (usuario.role === 'Analista') {
        const permisoUsuario = permisosMock.find(p => p.usuarioId === usuario.id);
        permisosIniciales[usuario.id] = permisoUsuario ? [...permisoUsuario.modulosPermitidos] : [];
      }
    });
    setPermisosLocales(permisosIniciales);
    setIsInitialized(true);
  }, []); // Sin dependencias para evitar loops

  const handleCheckboxChange = (usuarioId, moduloId) => {
    setPermisosLocales(prev => {
      const permisosUsuario = [...(prev[usuarioId] || [])];
      const index = permisosUsuario.indexOf(moduloId);
      
      if (index >= 0) {
        permisosUsuario.splice(index, 1);
      } else {
        permisosUsuario.push(moduloId);
      }
      
      return {
        ...prev,
        [usuarioId]: permisosUsuario
      };
    });
  };

  const handleGuardarCambios = () => {
    Object.keys(permisosLocales).forEach(usuarioId => {
      updatePermisosForUsuario(parseInt(usuarioId), permisosLocales[usuarioId]);
    });
    
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const analistas = usuariosMock.filter(u => u.role === 'Analista');

  if (user?.role !== 'Administrador') {
    return null;
  }

  if (!isInitialized) {
    return <div className="content">Cargando permisos...</div>;
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#f4f9fb', minHeight: '100vh', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#0f4c5c', margin: 0, fontSize: '26px' }}>Gestión de Permisos</h1>
        <p style={{ color: '#5a738e', margin: '4px 0 0 0', fontSize: '14px' }}>
          Asigna módulos a los analistas del sistema
        </p>
      </div>

      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '24px', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)' 
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#0f4c5c', background: '#f8fafc' }}>
                <th style={{ padding: '12px' }}>Analista</th>
                <th style={{ padding: '12px' }}>Usuario</th>
                {modulos.map(modulo => (
                  <th key={modulo.id} style={{ padding: '12px', textAlign: 'center' }}>
                    <div>{modulo.codigo}</div>
                    <div style={{ fontSize: '10px', opacity: 0.7 }}>{modulo.titulo.substring(0, 20)}...</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analistas.map(analista => (
                <tr key={analista.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px' }}>
                    <strong style={{ color: '#0f4c5c' }}>{analista.nombre}</strong>
                  </td>
                  <td style={{ padding: '12px', color: '#475569' }}>{analista.username}</td>
                  {modulos.map(modulo => (
                    <td key={modulo.id} style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={permisosLocales[analista.id]?.includes(modulo.id) || false}
                        onChange={() => handleCheckboxChange(analista.id, modulo.id)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button 
          style={{ 
            background: '#0f4c5c', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            padding: '12px 24px', 
            cursor: 'pointer', 
            fontWeight: '600',
            marginTop: '20px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={handleGuardarCambios}
        >
          Guardar cambios
        </button>

        {showSuccess && (
          <div style={{ 
            background: '#dcfce7', 
            color: '#15803d', 
            padding: '12px 20px', 
            borderRadius: '8px', 
            marginTop: '15px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            Permisos actualizados correctamente
          </div>
        )}
      </div>
    </div>
  );
}

export default Permisos;