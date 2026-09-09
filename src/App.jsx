import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import CargarDataset from "./pages/CargarDataset";
import Reportes from "./pages/Reportes";
import Historial from "./pages/Historial";
import Usuarios from "./pages/Usuarios";
import Pacientes from "./pages/Pacientes";
import Configuracion from "./pages/Configuracion";
import Login from "./pages/Login";
import Modulos from "./pages/Modulos";
import ModuloDetalle from "./pages/ModuloDetalle";
import Permisos from "./pages/Permisos";
import { getToken } from "./api";

function AppLayout() {
  const location = useLocation();
  const loggedIn = Boolean(getToken());

  if (location.pathname === "/login") {
    return loggedIn ? <Navigate to="/" replace /> : <Login />;
  }

  if (!loggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main-content">
        <Header />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inicio" element={<Dashboard />} />
          <Route path="/importar-datos" element={<CargarDataset />} />
          <Route path="/pacientes" element={<Pacientes />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/modulos" element={<Modulos />} />
          <Route path="/modulos/:id" element={<ModuloDetalle />} />
          <Route path="/permisos" element={<Permisos />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
