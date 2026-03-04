---
description: Inicializar repositorio Git y subir código a GitHub
---
# Workflow: Git Init & Push

Este workflow inicializa un repositorio git local, añade todos los archivos, hace commit y sube el código al repositorio remoto proporcionado por el usuario.

// turbo
1. Inicializar Git
Run command: `git init`

2. Añadir Archivos
Run command: `git add .`

3. Commit Inicial
Run command: `git commit -m "feat: reconfiguración de infraestructura v3.1 con supabase"`

4. Renombrar rama principal
Run command: `git branch -M main`

5. NOTA: El usuario debe ejecutar manualmente `git remote add origin <URL>` y `git push -u origin main` ya que no tenemos la URL del repo.
