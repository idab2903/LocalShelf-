# LocalShelf

Gestor de archivos vía navegador para red local. Sin instalación en los dispositivos clientes, sin nube, sin cuenta. solo el navegador desde cualquier equipo de tu red.es un servidor de archivos HTTP que corre en la máquina y expone una interfaz web accesible desde cualquier dispositivo en la misma red. Puedes subir, descargar, organizar y previsualizar archivos sin salir del navegador.

## Características

- 📁 Navegación de carpetas
- ⬆ Subida de archivos con barra de progreso (hasta 10 GB)
- 👁 Vista previa de imágenes, video, audio, PDF y texto
- ☰ Vista en grid o lista
- Mover archivos arrastrando sobre carpetas
- Papelera para eliminar arrastrando
- 🔒 Carpeta `privado/` protegida con contraseña
- 📱 Responsive 

## Requisitos

- Node.js 18+
- npm o pnpm

### Configurar el entorno

Crea un archivo `.env` en la raíz del proyecto:

```
PORT=
ROOT_PATH=./files
PRIVATE_PASSWORD_HASH=
```

### Generar la contraseña de la carpeta privada

Contraseña creada con bcrypt
Copia el hash y pégalo en `PRIVATE_PASSWORD_HASH` del `.env`.

Si no configuras la contraseña, la carpeta `privado/` simplemente no pedirá autenticación.

## Uso

Al arrancar, la consola muestra las direcciones disponibles:
Abre cualquiera de esas direcciones en el navegador. 

## Estructura del proyecto

```
LocalShelf/
├── public/
│   ├── index.html      # Estructura HTML
│   ├── style.css       # Estilos
│   └── app.js          # Lógica del cliente
├── server.js           # Servidor Express (API REST)
├── .env                # Variables de entorno (no se sube al repo)
└── package.json
```

### API del servidor

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/list?path=` | Lista archivos de una carpeta |
| GET | `/download?path=` | Descarga o previsualiza un archivo |
| POST | `/upload?path=` | Sube un archivo |
| POST | `/mkdir` | Crea una carpeta |
| POST | `/move` | Mueve uno o varios archivos |
| POST | `/rename` | Renombra un archivo o carpeta |
| DELETE | `/delete?path=` | Elimina un archivo o carpeta |
| POST | `/auth-private` | Autentica la carpeta privada |
| POST | `/logout-private` | Cierra la sesión privada |


## Feature

- [ ] Renombrar archivos desde la UI
- [ ] Seleccionar todo con un checkbox global
- [ ] Descarga múltiple como ZIP
- [ ] Búsqueda de archivos por nombre
- [ ] Ordenar por nombre, tamaño o fecha

## Notas de seguridad

LocalShelf está pensado para uso en **red local de confianza**. No tiene autenticación global, cualquier dispositivo en tu red puede acceder. NO EXPONER A INTERNET 
