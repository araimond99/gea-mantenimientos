# GEA · Reservas de mantenimiento

Aplicación de React + TypeScript, lista para Vercel, con Supabase para identificación y reservas compartidas.

## Agenda acordada

40 cupos: 20 en México y 20 en Colombia. Cinco espacios por fecha; cada mantenimiento dura 15 minutos.

| País | Fechas de septiembre de 2026 | Horas de inicio |
| --- | --- | --- |
| México | 21, 22, 28 y 29 | 09:00, 09:30, 10:00, 10:30, 11:00 |
| Colombia | 21, 23, 28 y 30 | 09:00, 09:30, 10:00, 10:30, 11:00 |

México usa `America/Mexico_City`; Colombia, `America/Bogota`. Se muestran horas de la sede, independientemente del dispositivo del visitante. Si la sede mexicana está en otra zona, actualizar el horario antes de abrir reservas.

## Arranque local

1. Instalar Node.js 22.12 o superior.
2. Ejecutar `npm install`.
3. Copiar `.env.example` a `.env.local` y completar los dos valores de Supabase.
4. Ejecutar `npm run dev`.

Sin esos valores se muestra una **vista previa** que permite explorar los horarios. No registra personas ni guarda reservas ficticias. Con Supabase conectado, los datos se consultan del servidor y se actualizan cada 20 segundos y al volver a la pestaña.

## Conectar Supabase

1. Crear un proyecto en Supabase.
2. Ejecutar una vez `supabase/migrations/202609140001_campaign.sql` en su SQL Editor. Es una migración para un proyecto nuevo; no volver a ejecutarla sobre las tablas existentes.
3. En Authentication, habilitar Email con confirmación de correo y establecer una contraseña mínima de 8 caracteres. Mantener la confirmación de correo activada: la reserva exige un correo confirmado en el servidor.
4. En Authentication → URL Configuration, configurar Site URL con la URL publicada y autorizar como Redirect URL esa misma URL. Para pruebas locales agregar `http://127.0.0.1:5173`.
5. Configurar un proveedor SMTP para enviar confirmaciones y recuperación de contraseña a los empleados. El envío predeterminado de Supabase está restringido y no sirve para una campaña pública sin esta configuración.
6. Copiar Project URL y la clave **publishable** (o la antigua clave **anon**) a `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU-CLAVE-PUBLISHABLE
```

Estas dos variables son públicas por diseño. Nunca usar `service_role`, claves secretas, contraseñas de base de datos o tokens personales en variables `VITE_*`.

## Dar acceso al administrador

Primero registrarse en la app y confirmar el correo. Después, el dueño del proyecto ejecuta esto en el SQL Editor, reemplazando el correo:

```sql
insert into public.maintenance_admins(user_id)
select id from auth.users where lower(email) = lower('CORREO_DEL_ADMINISTRADOR')
on conflict do nothing;
```

Volver a iniciar sesión en la app. Aparecerá Administración, donde se muestran nombre, correo, país, fecha y hora. Los empleados solo pueden consultar su propia reserva. No hay contraseñas de administrador integradas ni roles asignables desde el registro.

## Publicar en Vercel

1. Guardar el proyecto en un repositorio privado de GitHub, sin `.env.local`.
2. Importar el repositorio desde Vercel → Add New → Project.
3. Seleccionar Vite (detección automática), comando `npm run build` y salida `dist`.
4. Agregar las dos variables anteriores en Environment Variables **antes** de construir. Vite las incorpora al compilado; cambiarlas requiere un nuevo despliegue.
5. Publicar y configurar esa URL en Supabase Authentication como se indica arriba.

También se puede publicar desde Vercel CLI. El proyecto incluye `vercel.json` con rutas y encabezados de seguridad. No requiere servidor propio.

## Reglas de reserva

- Solo existen 40 IDs posibles, 20 para cada país. Los clientes no pueden crear ni editar horarios.
- La base de datos obtiene la identidad y el correo confirmado de Supabase Auth. No acepta un correo o ID de usuario enviado por el navegador para asignar la reserva.
- Solo una reserva por usuario y por correo durante esta campaña, incluso entre países.
- Solo una reserva por espacio, mediante restricciones únicas y bloqueo transaccional del horario.
- Reintentar una confirmación para el mismo usuario y horario devuelve la reserva existente. No duplica registros.
- No se pueden reservar citas pasadas.
- Las tablas no son accesibles directamente desde la API; hay funciones limitadas con comprobaciones de identidad y permisos. Todas las tablas tienen RLS activado.
- No se borran ni modifican reservas desde la app. Cambios de cita se coordinan con Soporte TI.

## Verificación

`npm run build` comprueba TypeScript y genera la app.

`npm test` ejecuta la migración real en PostgreSQL embebido (PGlite), con usuarios y roles de prueba. Comprueba 40 cupos, zonas horarias, límites, privacidad, autorización, duplicados e idempotencia. No se conecta al proyecto real de Supabase.

`npm run test:ui` comprueba el flujo en escritorio y celular con servicios simulados. No envía correos ni crea reservas reales. Requiere el navegador de Playwright (`npx playwright install chromium`).

Antes de abrir la campaña, hacer una prueba con Supabase real: registro, correo de confirmación, login, reserva y consulta desde una segunda sesión. Las pruebas locales no sustituyen esta comprobación de la configuración del servicio de correo y el proyecto publicado.
