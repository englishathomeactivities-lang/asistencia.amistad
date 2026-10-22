# Asistencia · I.E. La Amistad

Aplicación estática para Vercel con autenticación, datos en Supabase y códigos QR firmados. El panel conserva el diseño del artefacto HTML recibido.

## Estructura

- `index.html`: interfaz para docentes.
- `api/config.js`: entrega al navegador la URL y la clave pública (anon) de Supabase.
- `api/qr.js`: firma los carnés QR y registra la asistencia escaneada. Requiere una sesión de docente y aplica las políticas RLS de Supabase.
- `supabase/schema.sql`: tablas, índices y políticas de seguridad.
- `supabase/migrations/20261020_school_schedule_periods.sql`: actualización de una base de datos existente para guardar horarios y periodos por año.

## Cuenta institucional

La aplicación está restringida a `englishathomeactivities@gmail.com` tanto en la interfaz y la función QR como en las políticas de Supabase. Usa ese mismo correo para administrar GitHub, Vercel y Supabase; el acceso por sí solo no configura las cuentas externas ni concede permisos de facturación o administración de sus plataformas. No pongas contraseñas ni tokens de esas cuentas en el código.

## Configuración inicial

1. Crea un proyecto Supabase y ejecuta `supabase/schema.sql` en el SQL Editor. Si el proyecto ya tenía la app funcionando, ejecuta solo `supabase/migrations/20261020_school_schedule_periods.sql` para conservar sus datos y habilitar el horario por año.
2. Desactiva el registro público en **Authentication → Providers → Email**. En Supabase Auth, crea el usuario `englishathomeactivities@gmail.com` y habilita el inicio de sesión con la contraseña correspondiente.
3. Agrega el perfil de docente desde el SQL Editor, usando el UUID de ese usuario:

   ```sql
   insert into public.profiles (id, role)
   select id, 'teacher'
   from auth.users
   where lower(email) = 'englishathomeactivities@gmail.com';
   ```

4. En GitHub, usa o crea la cuenta `englishathomeactivities@gmail.com`, crea un repositorio privado e importa allí los archivos de esta carpeta.
5. En Vercel, inicia sesión o crea la cuenta con ese correo e importa el repositorio. Los archivos de esta app están en la raíz del repositorio, así que deja **Root Directory** en la raíz (valor predeterminado `./`); no escribas `asistencia`. Agrega estas variables de entorno para Preview y Production:
   - `SUPABASE_URL`: URL del proyecto Supabase.
   - `SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`: clave pública del proyecto. Solo la clave pública anon/publishable se entrega al navegador; nunca configures ni uses `SUPABASE_SECRET_KEY` o `service_role` en esta app.
   - `QR_SECRET`: secreto aleatorio largo para firmar los carnés. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
6. Despliega en Vercel e inicia sesión en la aplicación con `englishathomeactivities@gmail.com`.

Para probar localmente, ejecuta `node dev-server.js` desde esta carpeta y abre `http://localhost:3000`. Configura `SUPABASE_URL`, una clave pública (`SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`) y `QR_SECRET` en `.env.local`; si falta alguna, abre automáticamente un prototipo sin conexión con datos demostrativos que no se guardan. No publiques `.env.local` ni uses `SUPABASE_SECRET_KEY`/`service_role` como clave del cliente.

## Horarios y periodos

En **Panel docente → Horario y periodos** se administra el horario y las fechas de los periodos para el año seleccionado. La configuración se guarda en Supabase con acceso exclusivo al docente autorizado. Si todavía no existe una configuración de 2026, la app carga y guarda automáticamente la base que corresponde a la imagen compartida. Puedes copiar ese horario a otro año y modificarlo antes de guardarlo.

Los periodos iniciales de 2026 son:

- P1: 26 de enero–29 de marzo.
- P2: 6 de abril–21 de junio.
- P3: 6 de julio–4 de octubre.
- P4: 12 de octubre–29 de noviembre.

Los recesos entre esos rangos no se asignan a un periodo. La app usa estas fechas para clasificar tanto los registros nuevos como los datos históricos en los reportes. Los registros anteriores se conservan; su columna `period` no se reescribe.

En el registro diario se elige una clase del horario del día. Si varios bloques consecutivos son la misma materia y el mismo grupo, se configuran en una sola clase con varias horas, para llamar lista una sola vez. El botón de completar lista solo marca como asistentes a quienes aún no tienen estado y conserva las faltas, excusas y retardos ya registrados. El botón **Replicar esta lista a las demás materias del día** copia los estados registrados a las otras clases de ese mismo día y grado; solicita confirmación, conserva los registros existentes y guarda las nuevas copias en una sola operación. Cada clase guarda automáticamente sus cambios y muestra un indicador verde cuando la lista está guardada o rojo cuando la escritura falla; los errores muestran el motivo y permiten reintentar todos los cambios pendientes desde la misma pantalla sin refrescar. Los cambios pendientes permanecen en la pestaña hasta confirmarse, así que no se debe cerrar ni actualizar mientras el indicador no diga **Guardado**. Al guardarse, sus estadísticas por materia se actualizan. **Falta** se registra separado de **Excusa no justificada** y **Excusa justificada**.

La aplicación tiene dos secciones principales: **Asistencia** y **Materias**. En Asistencia, al elegir un periodo y una semana se resalta la selección y el calendario muestra únicamente los días lectivos de esa semana. Al elegir un día se ven todas las materias y horas programadas para sus grados; al abrir una clase se puede elegir el grado y llamar su lista. La asistencia se conserva separada por clase, materia, estudiante y fecha.

En **Materias**, **Resumen general** permite navegar por P1–P4 y muestra una gráfica de barras con todos los estados del periodo seleccionado, sin comparar los periodos entre sí. Un selector plegable permite cambiar el grado. El informe y su descarga CSV compatible con Excel incluyen el conteo por estudiante de todos los estados del periodo y, además, las faltas por materia para el boletín. Cada materia individual conserva sus filtros por periodo, mes y estado, con su gráfica y resumen correspondientes.

## Datos y permisos

Solo usuarios autenticados que tengan `role = 'teacher'` en `profiles` pueden leer o modificar estudiantes y asistencias. La clave `service_role` no se usa en el navegador ni en la función QR. Cada QR lleva una firma HMAC y solo registra asistencia para la fecha actual de Colombia.

La lista inicial incluida en el artefacto se carga desde el panel docente cuando la base de datos no tiene estudiantes.
