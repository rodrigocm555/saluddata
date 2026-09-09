from __future__ import annotations

import csv
import io
import os
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import DIST_DIR, EMAIL_DEV_MODE, PROJECT_DIR, UPLOAD_DIR
from database import db, init_db, row_to_dict, seed_admin, utc_now
from email_service import send_verification_code
from importer import import_hospital_csv
from security import generate_otp, hash_otp, hash_password, issue_token, verify_password, verify_token
from analytics import get_dashboard_cache

app = FastAPI(title='SaludData CRM API', version='3.0.0', docs_url='/api/docs', redoc_url=None)

# Configurar CORS para desarrollo y producción
allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000').split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

init_db()
seed_admin()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class LoginBody(BaseModel):
    username: str
    password: str


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=30)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class VerifyBody(BaseModel):
    username: str
    code: str


class UserCreate(BaseModel):
    name: str
    username: str
    email: str
    password: str = Field(min_length=8)
    role: str = 'Analista'


class StatusBody(BaseModel):
    active: bool


def mask_email(email: str) -> str:
    if '@' not in email:
        return email
    name, domain = email.split('@', 1)
    visible = name[: min(2, len(name))]
    return visible + '*' * max(2, len(name) - len(visible)) + '@' + domain


def get_current_user(request: Request) -> dict:
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Sesión no válida.')
    payload = verify_token(auth[7:].strip())
    if not payload:
        raise HTTPException(status_code=401, detail='Sesión vencida o no válida.')
    with db() as conn:
        user = conn.execute(
            'SELECT id,name,username,email,role,active,created_at FROM users WHERE id=?',
            (payload['id'],),
        ).fetchone()
    if not user or not user['active']:
        raise HTTPException(status_code=401, detail='Usuario no válido.')
    result = dict(user)
    result['active'] = bool(result['active'])
    return result


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user['role'] != 'Administrador':
        raise HTTPException(status_code=403, detail='Acceso restringido al administrador.')
    return user


def latest_dataset_id() -> int | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM datasets WHERE status='procesado' ORDER BY COALESCE(processed_at, uploaded_at) DESC, id DESC LIMIT 1"
        ).fetchone()
    return int(row['id']) if row else None


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        payload = detail
    else:
        payload = {'message': str(detail)}
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(Exception)
async def generic_exception_handler(_request: Request, exc: Exception):
    print('ERROR:', repr(exc))
    return JSONResponse(status_code=500, content={'message': f'Error interno: {exc}'})


@app.get('/api/health')
def health():
    return {'ok': True, 'database': 'Supabase PostgreSQL', 'backend': 'Python + FastAPI'}


def create_verification_for_user(user) -> dict:
    code = generate_otp()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(timespec='seconds')
    with db() as conn:
        conn.execute('UPDATE login_codes SET used_at=? WHERE user_id=? AND used_at IS NULL', (utc_now(), user['id']))
        conn.execute(
            'INSERT INTO login_codes(user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,?)',
            (user['id'], hash_otp(code), expires, 0, utc_now()),
        )
        conn.commit()

    mail = send_verification_code(user['email'], user['name'], code)
    response = {
        'message': f"Enviamos un código de verificación a {mask_email(user['email'])}." if mail['delivered'] else 'Código generado en modo desarrollo.',
        'verificationRequired': True,
        'username': user['username'],
        'emailMasked': mask_email(user['email']),
    }
    if mail.get('devMode') and EMAIL_DEV_MODE:
        response['devCode'] = code
    return response


@app.post('/api/auth/register', status_code=201)
def register(body: RegisterBody):
    name = body.name.strip()
    username = body.username.strip()
    email = body.email.strip().lower()

    if len(name) < 2:
        raise HTTPException(400, 'Ingresa tu nombre completo.')
    if not username.replace('_', '').replace('.', '').isalnum():
        raise HTTPException(400, 'El usuario solo puede contener letras, números, punto y guion bajo.')
    if '@' not in email or email.startswith('@') or email.endswith('@') or '.' not in email.split('@', 1)[1]:
        raise HTTPException(400, 'Ingresa un correo válido.')

    try:
        with db() as conn:
            cur = conn.execute(
                '''INSERT INTO users(name,username,email,password_hash,role,active,created_at,updated_at)
                   VALUES (?,?,?,?, 'Analista',1,?,?) RETURNING id''',
                (name, username, email, hash_password(body.password), utc_now(), utc_now()),
            )
            conn.commit()
            new_id = cur.fetchone()['id']
            user = conn.execute(
                'SELECT id,name,username,email,role,active FROM users WHERE id=?',
                (new_id,),
            ).fetchone()
    except Exception as exc:
        if 'users_username' in str(exc) or 'uq_users_username' in str(exc) or 'UNIQUE constraint failed: users.username' in str(exc):
            raise HTTPException(409, 'Ese nombre de usuario ya está registrado.')
        if 'users_email' in str(exc) or 'uq_users_email' in str(exc) or 'UNIQUE constraint failed: users.email' in str(exc):
            raise HTTPException(409, 'Ese correo ya está registrado.')
        if 'duplicate key' in str(exc).lower() or 'UNIQUE constraint failed' in str(exc):
            raise HTTPException(409, 'El usuario o correo ya está registrado.')
        raise

    try:
        response = create_verification_for_user(user)
    except Exception:
        # Si el correo no puede generarse/enviarse, no dejamos una cuenta pública a medio registrar.
        with db() as conn:
            conn.execute('DELETE FROM users WHERE id=?', (user['id'],))
            conn.commit()
        raise

    response['accountCreated'] = True
    response['message'] = (
        f"Cuenta creada. Enviamos un código de verificación a {mask_email(user['email'])}."
        if 'devCode' not in response
        else 'Cuenta creada. Código generado en modo desarrollo.'
    )
    return response


@app.post('/api/auth/login')
def login(body: LoginBody):
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(400, 'Ingresa usuario y contraseña.')
    with db() as conn:
        user = conn.execute(
            'SELECT id,name,username,email,password_hash,role,active FROM users WHERE lower(username)=lower(?) LIMIT 1',
            (username,),
        ).fetchone()
        if not user or not user['active'] or not verify_password(body.password, user['password_hash']):
            raise HTTPException(401, 'Usuario o contraseña incorrectos.')


    try:
        return create_verification_for_user(user)
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.post('/api/auth/verify-code')
def verify_code(body: VerifyBody):
    username = body.username.strip()
    code = body.code.strip()
    if not username or len(code) != 6 or not code.isdigit():
        raise HTTPException(400, 'Ingresa un código válido de 6 dígitos.')

    with db() as conn:
        user = conn.execute(
            'SELECT id,name,username,email,role,active FROM users WHERE lower(username)=lower(?) LIMIT 1',
            (username,),
        ).fetchone()
        if not user or not user['active']:
            raise HTTPException(401, 'Usuario no válido.')
        record = conn.execute(
            'SELECT id,code_hash,expires_at,attempts FROM login_codes WHERE user_id=? AND used_at IS NULL ORDER BY id DESC LIMIT 1',
            (user['id'],),
        ).fetchone()
        if not record:
            raise HTTPException(401, 'No existe un código activo. Solicita uno nuevo.')
        try:
            expires_at = datetime.fromisoformat(record['expires_at'])
        except ValueError:
            expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(401, 'El código venció. Solicita uno nuevo.')
        if record['attempts'] >= 5:
            raise HTTPException(429, 'El código fue bloqueado por demasiados intentos.')
        if record['code_hash'] != hash_otp(code):
            conn.execute('UPDATE login_codes SET attempts=attempts+1 WHERE id=?', (record['id'],))
            conn.commit()
            raise HTTPException(401, 'Código incorrecto.')
        conn.execute('UPDATE login_codes SET used_at=? WHERE id=?', (utc_now(), record['id']))
        conn.commit()

    user_dict = dict(user)
    user_dict['active'] = bool(user_dict['active'])
    token = issue_token(user_dict)
    return {'token': token, 'user': {k: user_dict[k] for k in ('id','name','username','email','role')}}


@app.get('/api/auth/me')
def me(user: dict = Depends(get_current_user)):
    return user


@app.get('/api/users')
def users_list(_admin: dict = Depends(require_admin)):
    with db() as conn:
        rows = conn.execute('SELECT id,name,username,email,role,active,created_at FROM users ORDER BY created_at DESC, id DESC').fetchall()
    return [{**dict(r), 'active': bool(r['active'])} for r in rows]


@app.post('/api/users', status_code=201)
def users_create(body: UserCreate, _admin: dict = Depends(require_admin)):
    if '@' not in body.email or body.email.startswith('@') or body.email.endswith('@'):
        raise HTTPException(400, 'Ingresa un correo válido.')
    if body.role not in ('Administrador', 'Analista'):
        raise HTTPException(400, 'Rol no válido.')
    try:
        with db() as conn:
            cur = conn.execute(
                '''INSERT INTO users(name,username,email,password_hash,role,active,created_at,updated_at)
                   VALUES (?,?,?,?,?,1,?,?) RETURNING id''',
                (body.name.strip(), body.username.strip(), body.email.lower(), hash_password(body.password), body.role, utc_now(), utc_now()),
            )
            conn.commit()
            new_id = cur.fetchone()['id']
            row = conn.execute('SELECT id,name,username,email,role,active,created_at FROM users WHERE id=?', (new_id,)).fetchone()
    except Exception as exc:
        if 'duplicate key' in str(exc).lower() or 'UNIQUE constraint failed' in str(exc):
            raise HTTPException(409, 'El usuario o correo ya está registrado.')
        raise
    result = dict(row)
    result['active'] = bool(result['active'])
    return result


@app.patch('/api/users/{user_id}/status')
def users_status(user_id: int, body: StatusBody, admin: dict = Depends(require_admin)):
    if int(admin['id']) == user_id and not body.active:
        raise HTTPException(400, 'No puedes desactivar tu propia cuenta.')
    with db() as conn:
        conn.execute('UPDATE users SET active=?, updated_at=? WHERE id=?', (1 if body.active else 0, utc_now(), user_id))
        conn.commit()
        row = conn.execute('SELECT id,name,username,email,role,active FROM users WHERE id=?', (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Usuario no encontrado.')
    result = dict(row)
    result['active'] = bool(result['active'])
    return result


@app.get('/api/datasets')
def datasets_list(_user: dict = Depends(get_current_user)):
    with db() as conn:
        rows = conn.execute(
            '''SELECT d.id,d.original_name,d.status,d.rows_imported,d.uploaded_at,d.processed_at,
                      d.min_appointment_date,d.max_appointment_date,d.cutoff_date,u.name AS uploaded_by_name
               FROM datasets d LEFT JOIN users u ON u.id=d.uploaded_by ORDER BY d.uploaded_at DESC,d.id DESC'''
        ).fetchall()
    return [dict(r) for r in rows]


@app.post('/api/datasets/upload', status_code=201)
def dataset_upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(400, 'Solo se permiten archivos CSV.')

    max_size = 150 * 1024 * 1024
    suffix = Path(file.filename).suffix
    fd, tmp_name = tempfile.mkstemp(prefix='saluddata_', suffix=suffix, dir=UPLOAD_DIR)
    os.close(fd)
    tmp_path = Path(tmp_name)
    size = 0
    try:
        with tmp_path.open('wb') as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(413, 'El archivo supera el límite de 150 MB.')
                out.write(chunk)
        result = import_hospital_csv(tmp_path, file.filename, int(user['id']))
        if result.get('alreadyImported'):
            return {
                'message': 'Este mismo dataset ya estaba importado. Se reutilizó la carga existente.',
                'datasetId': result['datasetId'],
                'rowsImported': result['rowsImported'],
            }
        return {
            'message': 'Dataset importado correctamente en Supabase.',
            'datasetId': result['datasetId'],
            'rowsImported': result['rowsImported'],
        }
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.get('/api/datasets/{dataset_id}/preview')
def dataset_preview(dataset_id: int, limit: int = Query(10, ge=1, le=50), _user: dict = Depends(get_current_user)):
    with db() as conn:
        rows = conn.execute(
            '''SELECT patient_id AS ID,especialidad AS ESPECIALIDAD,sexo AS SEXO,edad AS EDAD,
                      CASE WHEN seguro=1 THEN 'SI' WHEN seguro=0 THEN 'NO' ELSE '' END AS SEGURO,
                      modalidad AS PRESENCIAL_REMOTO,
                      CASE WHEN atendido=1 THEN 'SI' ELSE 'NO' END AS ATENDIDO,
                      monto AS MONTO,fecha_cita AS DIA_CITA
               FROM appointments WHERE dataset_id=? ORDER BY id LIMIT ?''',
            (dataset_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def resolve_dataset_id(requested: int | None) -> int | None:
    if requested:
        return requested
    return latest_dataset_id()


@app.get('/api/dashboard/overview')
def dashboard_overview(response: Response, datasetId: int | None = None, _user: dict = Depends(get_current_user)):
    dataset_id = resolve_dataset_id(datasetId)
    if not dataset_id:
        return {'datasetId': None, 'summary': {'datasetId': None}}
    response.headers['Cache-Control'] = 'private, max-age=60'
    return get_dashboard_cache(dataset_id)


@app.get('/api/dashboard/summary')
def dashboard_summary(datasetId: int | None = None, _user: dict = Depends(get_current_user)):
    dataset_id = resolve_dataset_id(datasetId)
    if not dataset_id:
        return {'datasetId': None, 'totalRecords': 0, 'attended': 0, 'notAttended': 0, 'totalAmount': 0, 'avgAmount': 0, 'patients': 0, 'specialties': 0}
    with db() as conn:
        s = conn.execute(
            '''SELECT COUNT(*) total_records,
                      SUM(CASE WHEN atendido=1 THEN 1 ELSE 0 END) attended,
                      SUM(CASE WHEN atendido=0 THEN 1 ELSE 0 END) not_attended,
                      COALESCE(SUM(monto),0) total_amount,
                      COALESCE(AVG(monto),0) avg_amount,
                      COUNT(DISTINCT patient_id) patients,
                      COUNT(DISTINCT especialidad) specialties
               FROM appointments WHERE dataset_id=?''',
            (dataset_id,),
        ).fetchone()
        dataset = conn.execute(
            'SELECT original_name,cutoff_date,min_appointment_date,max_appointment_date FROM datasets WHERE id=?',
            (dataset_id,),
        ).fetchone()
        main_modality = conn.execute(
            'SELECT modalidad FROM appointments WHERE dataset_id=? GROUP BY modalidad ORDER BY COUNT(*) DESC LIMIT 1',
            (dataset_id,),
        ).fetchone()
        department = conn.execute(
            'SELECT departamento FROM appointments WHERE dataset_id=? GROUP BY departamento ORDER BY COUNT(*) DESC LIMIT 1',
            (dataset_id,),
        ).fetchone()
        district = conn.execute(
            'SELECT distrito FROM appointments WHERE dataset_id=? GROUP BY distrito ORDER BY COUNT(*) DESC LIMIT 1',
            (dataset_id,),
        ).fetchone()
    return {
        'datasetId': dataset_id,
        'totalRecords': int(s['total_records'] or 0),
        'attended': int(s['attended'] or 0),
        'notAttended': int(s['not_attended'] or 0),
        'totalAmount': float(s['total_amount'] or 0),
        'avgAmount': float(s['avg_amount'] or 0),
        'patients': int(s['patients'] or 0),
        'specialties': int(s['specialties'] or 0),
        'fileName': dataset['original_name'] if dataset else '',
        'cutoffDate': dataset['cutoff_date'] if dataset else None,
        'minAppointmentDate': dataset['min_appointment_date'] if dataset else None,
        'maxAppointmentDate': dataset['max_appointment_date'] if dataset else None,
        'mainModality': main_modality['modalidad'] if main_modality else '',
        'department': department['departamento'] if department else '',
        'district': district['distrito'] if district else '',
    }


@app.get('/api/dashboard/specialties')
def dashboard_specialties(datasetId: int | None = None, limit: int = Query(10, ge=1, le=30), _user: dict = Depends(get_current_user)):
    dataset_id = resolve_dataset_id(datasetId)
    if not dataset_id:
        return []
    with db() as conn:
        rows = conn.execute(
            'SELECT especialidad label,COUNT(*) value FROM appointments WHERE dataset_id=? GROUP BY especialidad ORDER BY COUNT(*) DESC LIMIT ?',
            (dataset_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get('/api/dashboard/modality')
def dashboard_modality(datasetId: int | None = None, _user: dict = Depends(get_current_user)):
    dataset_id = resolve_dataset_id(datasetId)
    if not dataset_id:
        return []
    with db() as conn:
        rows = conn.execute(
            "SELECT COALESCE(modalidad,'SIN DATO') label,COUNT(*) value FROM appointments WHERE dataset_id=? GROUP BY modalidad ORDER BY COUNT(*) DESC",
            (dataset_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get('/api/dashboard/attendance')
def dashboard_attendance(datasetId: int | None = None, _user: dict = Depends(get_current_user)):
    dataset_id = resolve_dataset_id(datasetId)
    if not dataset_id:
        return []
    with db() as conn:
        rows = conn.execute(
            "SELECT CASE WHEN atendido=1 THEN 'Atendidos' ELSE 'No atendidos' END label,COUNT(*) value FROM appointments WHERE dataset_id=? GROUP BY atendido ORDER BY atendido DESC",
            (dataset_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get('/api/dashboard/monthly')
def dashboard_monthly(datasetId: int | None = None, _user: dict = Depends(get_current_user)):
    dataset_id = resolve_dataset_id(datasetId)
    if not dataset_id:
        return []
    with db() as conn:
        rows = conn.execute(
            '''SELECT substr(fecha_cita,1,7) month,COUNT(*) total,
                      SUM(CASE WHEN atendido=1 THEN 1 ELSE 0 END) attended
               FROM appointments WHERE dataset_id=? AND fecha_cita IS NOT NULL
               GROUP BY substr(fecha_cita,1,7) ORDER BY month''',
            (dataset_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get('/api/patients')
def patients_list(page: int = Query(1, ge=1), limit: int = Query(25, ge=5, le=100), search: str = '', _user: dict = Depends(get_current_user)):
    offset = (page - 1) * limit
    search = search.strip()
    where = 'WHERE CAST(p.patient_id AS TEXT) LIKE ?' if search else ''
    args = [f'%{search}%'] if search else []
    with db() as conn:
        rows = conn.execute(
            f'''SELECT p.patient_id,p.sexo,p.edad,
                       CASE WHEN p.seguro=1 THEN 'SI' WHEN p.seguro=0 THEN 'NO' ELSE '' END seguro,
                       p.distrito,p.first_seen,p.last_seen,
                       COUNT(a.id) total_citas,
                       SUM(CASE WHEN a.atendido=1 THEN 1 ELSE 0 END) atendidas
                FROM patients p LEFT JOIN appointments a ON a.patient_id=p.patient_id
                {where}
                GROUP BY p.patient_id ORDER BY p.patient_id LIMIT ? OFFSET ?''',
            (*args, limit, offset),
        ).fetchall()
        total = conn.execute(f'SELECT COUNT(*) total FROM patients p {where}', args).fetchone()['total']
    return {'data': [dict(r) for r in rows], 'page': page, 'limit': limit, 'total': int(total)}


@app.get('/api/patients/{patient_id}')
def patient_detail(patient_id: int, _user: dict = Depends(get_current_user)):
    with db() as conn:
        p = conn.execute(
            '''SELECT p.*,
                      COUNT(a.id) total_citas,
                      SUM(CASE WHEN a.atendido=1 THEN 1 ELSE 0 END) atendidas,
                      COALESCE(SUM(a.monto),0) monto_total
               FROM patients p LEFT JOIN appointments a ON a.patient_id=p.patient_id
               WHERE p.patient_id=? GROUP BY p.patient_id''',
            (patient_id,),
        ).fetchone()
        if not p:
            raise HTTPException(404, 'Paciente no encontrado.')
        appts = conn.execute(
            '''SELECT fecha_cita,especialidad,modalidad,
                      CASE WHEN atendido=1 THEN 'SI' ELSE 'NO' END atendido,monto
               FROM appointments WHERE patient_id=? ORDER BY fecha_cita DESC LIMIT 50''',
            (patient_id,),
        ).fetchall()
    patient = dict(p)
    patient['seguro'] = 'SI' if p['seguro'] == 1 else ('NO' if p['seguro'] == 0 else '')
    return {'patient': patient, 'appointments': [dict(r) for r in appts]}


@app.get('/api/reports/specialties')
def reports_specialties(_user: dict = Depends(get_current_user)):
    dataset_id = latest_dataset_id()
    if not dataset_id:
        return []
    return get_dashboard_cache(dataset_id).get('specialtyReport', [])


@app.get('/api/reports/demographics')
def reports_demographics(_user: dict = Depends(get_current_user)):
    dataset_id = latest_dataset_id()
    if not dataset_id:
        return {'sex': [], 'insurance': [], 'ages': []}
    cached = get_dashboard_cache(dataset_id)
    with db() as conn:
        insurance = conn.execute(
            "SELECT CASE WHEN seguro=1 THEN 'Con seguro' WHEN seguro=0 THEN 'Sin seguro' ELSE 'Sin dato' END label,COUNT(*) value FROM appointments WHERE dataset_id=? GROUP BY seguro ORDER BY COUNT(*) DESC",
            (dataset_id,),
        ).fetchall()
    return {'sex': cached.get('gender', []), 'insurance': [dict(r) for r in insurance], 'ages': cached.get('ages', [])}


@app.get('/api/reports/specialties.csv')
def reports_specialties_csv(_user: dict = Depends(get_current_user)):
    rows = reports_specialties(_user)
    if not rows:
        raise HTTPException(404, 'No hay un dataset procesado.')
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(['Especialidad', 'Total', 'Atendidos', 'No atendidos', 'Monto promedio'])
    for r in rows:
        writer.writerow([r['especialidad'], r['total'], r['atendidos'], r['no_atendidos'], r['monto_promedio']])
    data = '\ufeff' + out.getvalue()
    return Response(
        content=data,
        media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename="reporte_especialidades.csv"'},
    )


# Servir el frontend React ya compilado. Las rutas /api/* se definieron arriba.
if (DIST_DIR.exists() and (DIST_DIR / 'assets').exists()):
    app.mount('/assets', StaticFiles(directory=DIST_DIR / 'assets'), name='assets')


@app.get('/{full_path:path}', include_in_schema=False)
def frontend(full_path: str):
    if full_path.startswith('api/'):
        raise HTTPException(404, 'Ruta API no encontrada.')
    target = DIST_DIR / full_path
    if full_path and target.exists() and target.is_file():
        return FileResponse(target)
    index = DIST_DIR / 'index.html'
    if index.exists():
        return FileResponse(index)
    return JSONResponse(
        status_code=503,
        content={'message': 'Frontend no compilado. Ejecuta npm install y npm run build, o usa la versión distribuida del proyecto.'},
    )
