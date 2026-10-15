# Portfolio — Uriel Vega

Portfolio personal estático construido con [Astro](https://astro.build), en español (`/es`) e inglés (`/en`).
Despliegue: Vercel. Producción: <https://portfolio-uriel-two.vercel.app>

## Requisitos

- Node.js 24.x (`engines` en `package.json`)
- npm (el repo incluye `package-lock.json`)

## Instalar

```bash
npm ci
```

## Desarrollar

```bash
npm run dev
```

Servidor local con recarga en caliente.

## Construir

```bash
npm run build
```

Ejecuta `astro check` y después `astro build`. La salida queda en `dist/`.

## Previsualizar

```bash
npm run preview
```

Sirve `dist/` en local. Requiere haber corrido `npm run build` antes.

## Verificar tipos

```bash
npm run check
```

## Lintear

```bash
npm run lint
```

ESLint sobre todo el repo, 0 errores.

## Formato

```bash
npm run format        # escribe los cambios
npm run format:check  # solo comprueba (CI)
```

Prettier, 0 errores.

## Contenido

```bash
npm run check:content
```

Verifica que los 6 YAML de `src/content/data/` y los 2 PDF de `src/content/assets/`
coinciden clave por clave con la fuente aprobada (8 archivos, `8 OK de 8`).
En un clon sin la fuente de autoría informa que no hay nada que comparar y sale en 0.

## Mascota

```bash
npm run check:mascot
```

Aserciones estáticas sobre el motor de la mascota (`src/scripts/mascot/engine.ts`):
observador, encadenado de saltos, `position:fixed` y movimiento reducido.

## Rutas

| Ruta           | Respuesta                        |
| -------------- | -------------------------------- |
| `/`            | 308 → `/es` (`vercel.json`)      |
| `/es`, `/en`   | 200                              |
| `/sitemap.xml` | 200 (rewrite al índice)          |
| `/index.html`  | 404 (rewrite a ruta inexistente) |
| resto          | 404 propia (`404.html`)          |

## Rollback (R20.9)

Si la versión publicada falla, volver al sitio anterior sin tocar el código:

1. En el panel de Vercel: **Deployments** → deployment estable anterior → **···** →
   **Instant Rollback** (o **Promote to Production**). Es inmediato y reversible.
2. Punto de retorno remoto: `bf600ab` (último `main` antes del rediseño a Astro).
   Promover cualquier deployment sobre ese commit deja producción como estaba.

Nunca `--force` sobre `main`: solo avance rápido (`merge --ff-only`).
