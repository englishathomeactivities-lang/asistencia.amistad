# Asistencia · I.E. La Amistad

Aplicación estática para Vercel con autenticación, datos en Supabase y códigos QR firmados. El panel conserva el diseño del artefacto HTML recibido.

## Estructura

- `index.html`: interfaz para docentes.
- `api/config.js`: entrega al navegador la URL y la clave pública (anon) de Supabase.
- `api/qr.js`: firma los carnés QR y registra la asistencia escaneada. Requiere una sesión de docente y aplica las políticas RLS de Supabase.
- `supabase/schema.sql`: tablas, índices y políticas de seguridad.

## Cuenta institucional

La aplicación está restringida a `englishathomeactivities@gmail.com` tanto en la interfaz y la función QR como en las políticas de Supabase. Usa ese mismo correo para administrar GitHub, Vercel y Supabase; el acceso por sí solo no configura las cuentas externas ni concede permisos de facturación o administración de sus plataformas. No pongas contraseñas ni tokens de esas cuentas en el código.

## Configuración inicial

1. Crea un proyecto Supabase y ejecuta `supabase/schema.sql` en el SQL Editor.
2. Desactiva el registro público en **Authentication → Providers → Email**. En Supabase Auth, crea el usuario `englishathomeactivities@gmail.com` y habilita el inicio de sesión con la contraseña correspondiente.
3. Agrega el perfil de docente desde el SQL Editor, usando el UUID de ese usuario:

   ```sql
   insert into public.profiles (id, role)
   select id, 'teacher'
   from auth.users
   where lower(email) = 'englishathomeactivities@gmail.com';
   ```

4. En GitHub, usa o crea la cuenta `englishathomeactivities@gmail.com`, crea un repositorio privado e importa allí los archivos de esta carpeta.
5. En Vercel, inicia sesión o crea la cuenta con ese correo, importa el repositorio de GitHub y establece `.` (la raíz del repositorio) como **Root Directory**. Agrega estas variables de entorno para Preview y Production:
   - `SUPABASE_URL`: URL del proyecto Supabase.
   - `SUPABASE_ANON_KEY`: clave pública `anon`/publishable del proyecto. Solo se entrega al navegador; nunca uses la clave `service_role`.
   - `QR_SECRET`: secreto aleatorio largo para firmar los carnés. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
6. Despliega en Vercel e inicia sesión en la aplicación con `englishathomeactivities@gmail.com`.

Para probar localmente, ejecuta `node dev-server.js` desde esta carpeta con las variables configuradas en `.env.local`; abre `http://localhost:3000`. Este servidor de desarrollo local entrega la misma interfaz y rutas `/api` sin vincular ni crear un proyecto Vercel. No publiques `.env.local`.

## Datos y permisos

Solo usuarios autenticados que tengan `role = 'teacher'` en `profiles` pueden leer o modificar estudiantes y asistencias. La clave `service_role` no se usa en el navegador ni en la función QR. Cada QR lleva una firma HMAC y solo registra asistencia para la fecha actual de Colombia.

La lista inicial incluida en el artefacto se carga desde el panel docente cuando la base de datos no tiene estudiantes.
