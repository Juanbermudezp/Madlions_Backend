# Forma de trabajo

**Tablero (Jira):** https://proyectosoftwaresec02.atlassian.net/jira/software/projects/SCRUM/boards/1

Columnas: Por hacer, En progreso, Code review, QA y Hecho. Cada historia tiene su card con la historia, los criterios de aceptación, el responsable, el elemento de diseño y, al terminarla, el enlace a su PR. Los cambios que no corresponden a una historia aprobada (rol en el usuario, datos iniciales, preparación del despliegue) tienen su propia card de soporte numerada después de la última historia (H30 en adelante).

## Ramas (Git Flow)

- `main`: código en producción. Recibe cambios solo desde `release/*` y `hotfix/*`.
- `develop`: rama de integración. Recibe los PR de las historias.
- `feature/<ID>-<descripcion>`: una rama por historia, por ejemplo `feature/H23-bandeja-de-avisos`.
- `bugfix/<ID>-<descripcion>`: correcciones de defectos encontrados en las pruebas.
- `release/<version>`: preparación de una versión (`release/1.0.0`).
- `hotfix/<descripcion>`: correcciones urgentes en producción.

## Commits

Formato `<gitmoji> <tipo>(<ID>): <descripción>`, en español y en presente, por ejemplo:

```
:sparkles: feat(H23): agrega la bandeja de avisos del miembro
:white_check_mark: test(H26): cubre el reporte de ocupacion
:wrench: chore(H34): habilita CORS para el frontend desplegado
:bookmark: chore: actualiza la version a 1.0.0
```

Tipos que usamos: `feat` (funcionalidad), `fix` (corrección), `test` (pruebas), `docs` (documentación), `refactor`, `style`, `chore` (configuración, dependencias, versiones).

## Pull requests

- **Título:** `<ID> · <nombre de la historia o task>`, por ejemplo `H34 · Preparación para despliegue`.
- **Origen y destino:** de `feature/<ID>-...` hacia `develop`. Las releases van de `release/X.Y.Z` hacia `main` y de vuelta a `develop`.
- **Descripción**, con estas secciones:
  ```markdown
  ## Task
  <código> · <nombre de la tarea>

  ## Cambios
  - ...

  ## Cómo probar
  1. ...

  ## Resultado
  ...

  ## Para H.. (opcional: lo que otra historia puede reutilizar)
  ```
- **Revisión:** cada PR lo aprueba al menos otro integrante distinto del autor. Después de aprobado lo fusiona el autor.
- **Tablero:** el enlace del PR se agrega a la card, y la card pasa a Hecho cuando el PR está fusionado y la historia pasó QA.
