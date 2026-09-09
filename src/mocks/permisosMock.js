import { modulos } from './modulosMock';

export const usuariosMock = [
  { id: 1, nombre: "Admin Usuario", username: "admin", email: "admin@saluddata.com", role: "Administrador" },
  { id: 2, nombre: "Analista Uno", username: "analista1", email: "analista1@saluddata.com", role: "Analista" },
  { id: 3, nombre: "Analista Dos", username: "analista2", email: "analista2@saluddata.com", role: "Analista" },
  { id: 4, nombre: "Analista Tres", username: "analista3", email: "analista3@saluddata.com", role: "Analista" }
];

export const permisosMock = [
  { usuarioId: 2, modulosPermitidos: [1, 2, 3] },
  { usuarioId: 3, modulosPermitidos: [1, 4, 5] },
  { usuarioId: 4, modulosPermitidos: [2, 3, 6] }
];

export const getPermisosForUsuario = (usuarioId) => {
  const permiso = permisosMock.find(p => p.usuarioId === usuarioId);
  return permiso ? permiso.modulosPermitidos : [];
};

export const updatePermisosForUsuario = (usuarioId, modulosPermitidos) => {
  const index = permisosMock.findIndex(p => p.usuarioId === usuarioId);
  if (index >= 0) {
    permisosMock[index].modulosPermitidos = modulosPermitidos;
  } else {
    permisosMock.push({ usuarioId, modulosPermitidos });
  }
  return permisosMock;
};

export const getModulosForUsuario = (usuarioId, role) => {
  if (role === 'Administrador') {
    return modulos;
  }
  
  const modulosPermitidos = getPermisosForUsuario(usuarioId);
  
  if (modulosPermitidos.length === 0) {
    return modulos;
  }
  
  return modulos.filter(modulo => modulosPermitidos.includes(modulo.id));
};