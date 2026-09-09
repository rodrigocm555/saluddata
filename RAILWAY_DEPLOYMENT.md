# Configuración de Despliegue en Railway

Este proyecto está configurado para desplegarse como dos servicios separados en Railway:
- **Backend**: FastAPI (Python) en el directorio `backend/`
- **Frontend**: React + Vite en la raíz del proyecto

## Variables de Entorno Necesarias

### Backend (Railway Service)
Configura estas variables en el panel de Railway para el servicio backend:

**Obligatorias:**
- `DATABASE_URL`: Cadena de conexión PostgreSQL (de Railway Postgres)
- `APP_SECRET`: Clave secreta para tokens JWT (genera una con: `openssl rand -hex 32`)
- `ALLOWED_ORIGINS`: Orígenes CORS permitidos (ej: `https://tu-frontend.vercel.app,https://tu-frontend.railway.app`)

**Opcionales (para autenticación por email):**
- `EMAIL_DEV_MODE`: `true` para desarrollo (muestra código en consola), `false` para producción
- `SMTP_HOST`: Servidor SMTP (ej: `smtp.gmail.com`)
- `SMTP_PORT`: Puerto SMTP (ej: `465`)
- `SMTP_SSL`: `true` para SSL, `false` para TLS
- `SMTP_USER`: Usuario SMTP
- `SMTP_PASS`: Contraseña SMTP
- `SMTP_FROM`: Email remitente

**Usuario Admin:**
- `ADMIN_NAME`: Nombre del administrador (default: `Administrador`)
- `ADMIN_USERNAME`: Username del admin (default: `admin`)
- `ADMIN_EMAIL`: Email del admin (default: `admin@saluddata.local`)
- `ADMIN_PASSWORD`: Contraseña del admin (default: `Cambiar123!`)

### Frontend (Railway/Vercel Service)
Configura esta variable para el servicio frontend:

- `VITE_API_URL`: URL del backend desplegado (ej: `https://tu-backend.railway.app`)

## Configuración de Servicios en Railway

### Opción 1: Dos servicios en Railway (Backend + Frontend)

1. **Backend Service:**
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - Environment variables: Configura las variables de backend mencionadas arriba

2. **Frontend Service:**
   - Root directory: `/` (raíz)
   - Build command: `npm install && npm run build`
   - Start command: No necesario (solo build)
   - Environment variables: `VITE_API_URL` apuntando a la URL del backend

### Opción 2: Backend en Railway + Frontend en Vercel (Recomendado)

1. **Backend en Railway:**
   - Igual que la opción 1 para el backend

2. **Frontend en Vercel:**
   - Conecta el repo de GitHub a Vercel
   - Root directory: `/`
   - Build command: `npm install && npm run build`
   - Output directory: `dist`
   - Environment variable: `VITE_API_URL` apuntando a la URL del backend Railway

## Pasos de Despliegue

### Para Railway (Backend):

1. Crea un proyecto nuevo en Railway
2. Conecta el repo de GitHub
3. Agrega un servicio "PostgreSQL"
4. Agrega un servicio "Python" con:
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. Configura las variables de entorno del backend
6. Obtén la URL del backend (ej: `https://tu-backend.railway.app`)

### Para Vercel (Frontend):

1. Crea un proyecto nuevo en Vercel
2. Conecta el repo de GitHub
3. Configura:
   - Root directory: `/`
   - Build command: `npm install && npm run build`
   - Output directory: `dist`
4. Agrega variable de entorno: `VITE_API_URL` = URL del backend Railway
5. Deploy

## Verificación

Después del despliegue:

1. Verifica que el backend responda en `https://tu-backend.railway.app/api/health`
2. Verifica que el frontend cargue y pueda autenticarse
3. Prueba la carga de CSV en los módulos (usa localStorage)
4. Verifica que las gráficas se generen correctamente

## Notas Importantes

- El sistema de módulos usa localStorage para cargar CSV, no se conecta a Supabase aún
- Los mocks de permisos y módulos están en `src/mocks/`
- CORS está configurado para aceptar orígenes dinámicos vía variable de entorno
- No subas el archivo `.env` real al repositorio (ya está en `.gitignore`)