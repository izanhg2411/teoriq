# Instalación y publicación de TEORIQ

## Instalar en modo desarrollador (uso personal)
1. Requisitos: Node 20+ y Chrome 114 o superior.
2. En la carpeta del proyecto (PowerShell o terminal):
   ```
   npm install
   npm run build
   ```
3. Abre `chrome://extensions`, activa **Modo de desarrollador**, pulsa **Cargar descomprimida** y elige la carpeta `dist/`.
4. Entra en https://cloud.aeolservice.es/, haz un test y pulsa el icono de TEORIQ para abrir el panel lateral.
5. Tras cambiar código: `npm run build` y pulsa «Recargar» en la tarjeta de la extensión.

El id de la extensión es estable (el manifest lleva `key`), así que tus datos no se pierden al cargarla desde otra carpeta.

## Estado respecto a Chrome Web Store: **NO lista para publicar**
Pendiente antes de enviarla:
- [ ] Prueba real y completa en AEOLCLOUD con una cuenta real (no verificada aún; ver ESTADO_PROYECTO.md).
- [ ] Quitar el campo `key` de `public/manifest.template.json` (la tienda asigna su propio id) y subir la versión.
- [ ] `npm run check` en verde y comprimir el **contenido** de `dist/` en un ZIP.
- [ ] Cuenta de desarrollador de Chrome Web Store (pago único).
- [ ] Ficha: descripción, capturas reales de pantalla, icono promocional.
- [ ] Alojar PRIVACIDAD.md en una URL pública y enlazarla en la ficha.
- [ ] Justificar permisos (`storage`, `sidePanel`, acceso a cloud.aeolservice.es) en el formulario de privacidad.
- [ ] Revisar términos de AEOLCLOUD y dejar claro que no hay afiliación ni se redistribuyen preguntas.
- [ ] Decidir el tratamiento de las imágenes de preguntas (hoy no se capturan).

## Generar el ZIP del proyecto
`npm run zip` crea `TEORIQ.zip` (sin `node_modules`, `dist` ni capturas).
