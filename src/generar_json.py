"""Genera web/datos/cartera.json a partir de la base pública UCI.

El JSON trae todo ya agregado: la página solo lo lee y lo muestra. No contiene
registros individuales.

Uso:
    python src/generar_json.py
    python src/generar_json.py --datos ruta/credito_tarjetas.csv --umbrales config/umbrales.json
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
DATOS_DEFECTO = RAIZ / "datos" / "credito_tarjetas.csv"
HERMANO = RAIZ.parent.parent / "riesgo-credito-politicas" / "datos" / "credito_tarjetas.csv"
UMBRALES_DEFECTO = RAIZ / "config" / "umbrales.json"
SALIDA_DEFECTO = RAIZ / "web" / "datos" / "cartera.json"

# Del mes más antiguo al más reciente. En la base original PAY_0 es septiembre
# y PAY_2 a PAY_6 son agosto a abril (no existe PAY_1).
MESES = ["abr", "may", "jun", "jul", "ago", "sep"]
COL_MORA = {"sep": "PAY_0", "ago": "PAY_2", "jul": "PAY_3", "jun": "PAY_4", "may": "PAY_5", "abr": "PAY_6"}
COL_SALDO = {"sep": "BILL_AMT1", "ago": "BILL_AMT2", "jul": "BILL_AMT3",
             "jun": "BILL_AMT4", "may": "BILL_AMT5", "abr": "BILL_AMT6"}

# Segmentos por tamaño de línea (dólares de Taiwán, la moneda de la base).
SEGMENTOS = [
    ("todos", "Toda la cartera", 0, np.inf),
    ("l1", "Línea hasta 50 mil", 0, 50_000),
    ("l2", "Línea de 50 a 100 mil", 50_000, 100_000),
    ("l3", "Línea de 100 a 200 mil", 100_000, 200_000),
    ("l4", "Línea de 200 a 400 mil", 200_000, 400_000),
    ("l5", "Línea de más de 400 mil", 400_000, np.inf),
]

# Bandas de uso de la línea: saldo del mes entre el límite.
BANDAS_USO = ["Sin saldo", "1 a 30%", "30 a 60%", "60 a 90%", "90% o más"]
# Estados de pago: la columna PAY de la base agrupada por meses de atraso.
ESTADOS = ["Sin consumo", "Pagó el total", "Revolvente al corriente",
           "1 mes de atraso", "2 meses", "3 meses", "4 meses o más"]
# Grupos de la matriz de transición. Se agrupan 1 y 2 meses porque de abril a
# agosto la base casi no registra "1 mes" y salta de 0 a 2.
GRUPOS = ["Al corriente", "1 a 2 meses", "3 o más"]


def estado_pago(pay: np.ndarray) -> np.ndarray:
    """Índice en ESTADOS para cada valor de PAY (-2 sin consumo, -1 pagó total, 0 revolvente)."""
    return np.where(pay <= -2, 0, np.where(pay == -1, 1, np.where(pay == 0, 2, np.minimum(pay, 4) + 2)))


def grupo_mora(pay: np.ndarray) -> np.ndarray:
    return np.where(pay <= 0, 0, np.where(pay <= 2, 1, 2))


def banda_uso(saldo: np.ndarray, limite: np.ndarray) -> np.ndarray:
    uso = saldo / limite
    return np.where(saldo <= 0, 0, np.where(uso < 0.3, 1, np.where(uso < 0.6, 2, np.where(uso < 0.9, 3, 4))))


def pct(parte: float, total: float) -> float:
    return round(100.0 * parte / total, 2) if total else 0.0


def agregados_mes(df: pd.DataFrame, mes: str) -> dict:
    pay = df[COL_MORA[mes]].to_numpy()
    saldo = df[COL_SALDO[mes]].to_numpy().astype(float)
    expo = np.clip(saldo, 0, None)
    n = len(df)
    total_expo = float(expo.sum())
    est = estado_pago(pay)
    uso = banda_uso(saldo, df["LIMIT_BAL"].to_numpy().astype(float))
    k = math.ceil(0.10 * n) if n else 0
    top = float(np.sort(expo)[::-1][:k].sum()) if n else 0.0
    salida = {
        "clientes": int(n),
        "exposicion": int(round(total_expo)),
        "mora_1mas_clientes": int((pay >= 1).sum()),
        "mora_2mas_clientes": int((pay >= 2).sum()),
        "mora_3mas_clientes": int((pay >= 3).sum()),
        "mora_1mas_exposicion": int(round(expo[pay >= 1].sum())),
        "mora_2mas_exposicion": int(round(expo[pay >= 2].sum())),
        "top10_exposicion": int(round(top)),
        "estados": [{"clientes": int((est == i).sum()), "exposicion": int(round(expo[est == i].sum()))}
                    for i in range(len(ESTADOS))],
        "uso": [{"clientes": int((uso == i).sum()), "exposicion": int(round(expo[uso == i].sum()))}
                for i in range(len(BANDAS_USO))],
    }
    if mes == "sep":
        # La columna "default" de la base es el incumplimiento del mes siguiente
        # (octubre). Solo tiene sentido junto al estado de septiembre.
        inc = df["default"].to_numpy()
        salida["incumplen_siguiente_mes"] = int(inc.sum())
        for i in range(len(ESTADOS)):
            salida["estados"][i]["incumplen_siguiente_mes"] = int(inc[est == i].sum())
    return salida


def transicion(df: pd.DataFrame, mes_ant: str, mes: str) -> list:
    a = grupo_mora(df[COL_MORA[mes_ant]].to_numpy())
    b = grupo_mora(df[COL_MORA[mes]].to_numpy())
    return [[int(((a == i) & (b == j)).sum()) for j in range(len(GRUPOS))] for i in range(len(GRUPOS))]


def valor_indicador(clave: str, agr: dict, roll: list | None) -> float | None:
    if clave == "mora_2mas_clientes":
        return pct(agr["mora_2mas_clientes"], agr["clientes"])
    if clave == "mora_2mas_exposicion":
        return pct(agr["mora_2mas_exposicion"], agr["exposicion"])
    if clave == "uso_alto_exposicion":
        return pct(agr["uso"][4]["exposicion"], agr["exposicion"])
    if clave == "concentracion_top10":
        return pct(agr["top10_exposicion"], agr["exposicion"])
    if roll is None:
        return None
    if clave == "roll_empeora":
        return pct(roll[0][1] + roll[0][2], sum(roll[0]))
    if clave == "roll_a_3mas":
        return pct(roll[1][2], sum(roll[1]))
    raise KeyError(clave)


def semaforo(valor: float, ambar: float, rojo: float) -> str:
    if valor >= rojo:
        return "rojo"
    if valor >= ambar:
        return "ambar"
    return "verde"


def construir(df: pd.DataFrame, umbrales: dict) -> dict:
    cubo, rolls, alertas = {}, {}, []
    for mes in MESES:
        cubo[mes], rolls[mes] = {}, {}
    for sid, _, bajo, alto in SEGMENTOS:
        sub = df if sid == "todos" else df[(df["LIMIT_BAL"] > bajo) & (df["LIMIT_BAL"] <= alto)]
        for i, mes in enumerate(MESES):
            cubo[mes][sid] = agregados_mes(sub, mes)
            rolls[mes][sid] = transicion(sub, MESES[i - 1], mes) if i > 0 else None
    for mes in MESES:
        for sid, _, _, _ in SEGMENTOS:
            for clave, u in umbrales["indicadores"].items():
                v = valor_indicador(clave, cubo[mes][sid], rolls[mes][sid])
                if v is None:
                    continue
                alertas.append({"mes": mes, "segmento": sid, "indicador": clave, "valor": v,
                                "estado": semaforo(v, u["ambar"], u["rojo"])})
    return {
        "meta": {
            "fuente": "UCI Machine Learning Repository, Default of Credit Card Clients (Yeh y Lien, 2009). "
                      "30,000 clientes de tarjeta de Taiwán, abril a septiembre de 2005.",
            "moneda": "Dólares de Taiwán (NT$), la moneda de la base",
            "clientes": int(len(df)),
            "meses": MESES,
            "nota_mora": "De abril a agosto la base casi no registra 1 mes de atraso y salta de 0 a 2. "
                         "Por eso la mora de 1 mes o más da un salto en septiembre y la de 2 meses o más "
                         "es la serie comparable.",
            "nota_incumplimiento": "El incumplimiento observado es el del mes siguiente (octubre) y solo se "
                                   "muestra junto al estado de septiembre.",
            "aviso": "Datos públicos de 2005 con fines educativos. No hay información de ningún banco.",
        },
        "segmentos": [{"id": s[0], "nombre": s[1]} for s in SEGMENTOS],
        "bandas_uso": BANDAS_USO,
        "estados": ESTADOS,
        "grupos_mora": GRUPOS,
        "umbrales": {k: {"nombre": v["nombre"], "ambar": v["ambar"], "rojo": v["rojo"]}
                     for k, v in umbrales["indicadores"].items()},
        "meses": cubo,
        "transiciones": rolls,
        "alertas": alertas,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--datos", type=Path, default=None)
    p.add_argument("--umbrales", type=Path, default=UMBRALES_DEFECTO)
    p.add_argument("--salida", type=Path, default=SALIDA_DEFECTO)
    a = p.parse_args()
    ruta = a.datos or (DATOS_DEFECTO if DATOS_DEFECTO.exists() else HERMANO)
    if not ruta.exists():
        raise SystemExit(f"No encuentro la base en {ruta}. Corre src/preparar_datos.py primero.")
    df = pd.read_csv(ruta)
    umbrales = json.loads(a.umbrales.read_text(encoding="utf-8"))
    resultado = construir(df, umbrales)
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    colores = pd.Series([x["estado"] for x in resultado["alertas"]]).value_counts().to_dict()
    print(f"Listo: {a.salida} ({len(df):,} clientes, {len(resultado['alertas'])} alertas: {colores})")


if __name__ == "__main__":
    main()
