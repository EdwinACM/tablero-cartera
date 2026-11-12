# Seguridad

## Cómo reportar un problema

Si encuentras una vulnerabilidad, repórtala de forma privada desde la pestaña Security de este repositorio, con la opción "Report a vulnerability". Por favor no abras un issue público con los detalles.

## Alcance

Es un proyecto educativo. La página es estática, no tiene servidor propio, cuentas ni datos personales.

- Usa solo datos públicos de UCI. No contiene información de ningún banco ni de sus clientes, y el JSON publicado trae solo agregados.
- La página no carga nada de internet: sin CDN, sin fuentes externas y sin librerías de gráficas. Una política CSP en el HTML limita scripts, estilos, imágenes y conexiones al mismo origen.
- El código de la página no usa innerHTML, eval ni scripts en línea, y los textos entran con textContent. Una prueba automática lo revisa.
- El único paso que usa internet es `src/preparar_datos.py`, que descarga la base por https, verifica su suma SHA-256 y extrae solo el archivo esperado.
- Las dependencias de Python están fijadas a una versión y Dependabot las revisa cada semana. Las acciones de GitHub están fijadas a un commit.
