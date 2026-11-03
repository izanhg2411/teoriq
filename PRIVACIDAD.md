# Privacidad de TEORIQ

TEORIQ es una herramienta personal de estudio. **Todo el historial permanece en tu dispositivo.**

## Qué información almacena
Solo de las preguntas que visualizas **y contestas tú** en AEOLCLOUD:
- Enunciado y opciones de la pregunta, la opción que elegiste y la correcta.
- Resultado (acierto / fallo / pendiente de revisión), fecha y hora, y tiempo de respuesta aproximado.
- Imagen reducida de la pregunta (JPEG de unos 380 px de ancho), cuando la pregunta la tiene; ocupa espacio local (límite interno ≈6,5 MB) y entra en las copias de seguridad.
- Tema asignado (clasificación local por palabras clave o corrección manual).
- Estado de repaso (Leitner) y tus ajustes (fecha de examen, minutos y preguntas al día, avisos).

## Dónde se almacena
En `chrome.storage.local` del perfil de Chrome donde está instalada la extensión. No hay cuentas, servidores propios, analítica ni sincronización en la nube.
Si desinstalas la extensión o borras los datos desde la pestaña *Datos*, el historial desaparece (por eso conviene exportar copias).

## Qué NO recopila
- No envía datos a ningún servidor: el código no realiza llamadas de red.
- No lee tus credenciales, datos personales de tu cuenta de AEOLCLOUD ni otras pestañas o sitios.
- No descarga ni redistribuye el banco de preguntas de la plataforma ni incluye ninguna pregunta.
- No descarga imágenes de internet: la foto de la pregunta ya viene incrustada en la página de AEOLCLOUD y TEORIQ solo guarda una copia reducida en tu navegador.

## Permisos y por qué
| Permiso | Motivo |
|---|---|
| `storage` | Guardar el historial y los ajustes en tu navegador. |
| `sidePanel` | Mostrar el panel lateral al pulsar el icono de la extensión. |
| Content script solo en `https://cloud.aeolservice.es/*` | Detectar tus respuestas en esa plataforma. No hay `host_permissions` ni acceso a otros sitios. |

## Exportar y eliminar tus datos
Pestaña **Datos** del panel (o página de opciones):
- **Exportar**: descarga un JSON con todo tu historial.
- **Importar**: restaura una copia (fusionar sin duplicados, o reemplazar). Los archivos inválidos se rechazan con un mensaje.
- **Borrar todo**: elimina el historial y los ajustes de forma permanente.

## IA futura
No existe ninguna función de IA. Si se añade, será opcional, con clave propia del usuario y autorización explícita antes de enviar cualquier dato a un proveedor externo; esta política se actualizaría antes.

## Afiliación
TEORIQ es un proyecto independiente, no afiliado a AEOLCLOUD ni a la DGT.
