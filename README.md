# ARGYR en Vercel + Supabase

App de ventas (pedidos, cobros, dinero, estadísticas, exportación a Excel/CSV). Sitio estático: no necesita build.

## 1. Supabase
1. Creá un proyecto en supabase.com.
2. En **SQL Editor**, pegá el contenido de `supabase/schema.sql` y tocá **Run**.
3. En **Project Settings > API**, copiá la *Project URL* y la clave *anon public*, y pegalas en `config.js`.
4. En **Authentication > Providers > Email**: si no querés confirmar el correo, desactivá "Confirm email".
5. Abrí la app, tocá "No tengo cuenta" y creá tu usuario.
6. Cuando ya tengas tu usuario, desactivá **Allow new users to sign up** (Authentication > Sign In / Providers) para que nadie más pueda registrarse.

## 2. Vercel
- Con GitHub: subí esta carpeta a un repositorio, en vercel.com elegí **Add New > Project**, importalo, *Framework Preset: Other*, sin build command. Deploy.
- Sin GitHub: en esta carpeta, `npx vercel` y seguí las preguntas.

## Notas
- Cada usuario ve solo sus filas (RLS). La clave anon puede estar en el código público; nunca uses la `service_role`.
- El PIN de la app bloquea la pantalla de este dispositivo y se guarda en el navegador. No reemplaza la contraseña de la cuenta.
- Descargá una copia JSON desde Ajustes de vez en cuando, además del respaldo que ya hace Supabase.
