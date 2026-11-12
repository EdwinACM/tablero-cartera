# Bitácora de decisiones

Corrida del 12 de noviembre de 2026.

1. Los datos son los de UCI, los mismos de riesgo-credito-politicas. El generador usa la copia de ese proyecto si no encuentra una propia en `datos/`.
2. El JSON trae solo agregados por mes y segmento, así que la página no necesita la base y no expone registros.
3. Mapeo de meses: PAY_0 y BILL_AMT1 son septiembre; PAY_2 a PAY_6 y BILL_AMT2 a BILL_AMT6 son agosto a abril. No existe PAY_1.
4. La mora de 1 mes o más salta en septiembre (de 14.8% a 22.7%) porque de abril a agosto casi nadie aparece con 1 mes. Por eso los indicadores del semáforo usan 2 meses o más, y la gráfica muestra las dos series con una nota.
5. Roll rates con tres grupos (al corriente, 1 a 2 meses, 3 o más), por la misma razón.
6. Exposición es el saldo positivo del mes. Los saldos negativos (a favor del cliente) cuentan como cero.
7. Los segmentos son cinco rangos de tamaño de línea, porque la base no trae producto ni región. No uso sexo, edad, estado civil ni educación.
8. El incumplimiento observado de la base es el del mes siguiente (octubre) y solo se enseña junto a septiembre.
9. Los umbrales de ejemplo están en `config/umbrales.json`. La primera versión usaba 30% y 40% para la concentración del 10% de clientes con más saldo, pero toda la cartera ya estaba en 45%, así que los subí a 40% y 50%.
10. Las alertas se calculan en el script con los valores redondeados a dos decimales, para que el color coincida con la cifra que se muestra.
11. Las pruebas recalculan los totales desde el CSV con la biblioteca estándar, sin pandas, para no repetir la lógica del generador.
12. El semáforo lleva icono (círculo, rombo, triángulo) y texto además del color, para que no dependa solo de este.
