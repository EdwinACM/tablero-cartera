"""Pruebas del JSON de la cartera. Se corren con: python -m pytest

Las pruebas de cuadre recalculan todo desde el CSV con la biblioteca estándar
(sin pandas ni numpy), para no repetir el mismo código que genera el JSON."""
import csv
import json
import math
import re
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

JSON_RUTA = RAIZ / "web" / "datos" / "cartera.json"
CANDIDATOS = [RAIZ / "datos" / "credito_tarjetas.csv",
              RAIZ.parent.parent / "riesgo-credito-politicas" / "datos" / "credito_tarjetas.csv"]
CSV_RUTA = next((c for c in CANDIDATOS if c.exists()), None)

MESES = ["abr", "may", "jun", "jul", "ago", "sep"]
PAY = {"sep": "PAY_0", "ago": "PAY_2", "jul": "PAY_3", "jun": "PAY_4", "may": "PAY_5", "abr": "PAY_6"}
BILL = {"sep": "BILL_AMT1", "ago": "BILL_AMT2", "jul": "BILL_AMT3", "jun": "BILL_AMT4",
        "may": "BILL_AMT5", "abr": "BILL_AMT6"}
LIMITES = {"todos": (0, math.inf), "l1": (0, 50_000), "l2": (50_000, 100_000),
           "l3": (100_000, 200_000), "l4": (200_000, 400_000), "l5": (400_000, math.inf)}


@pytest.fixture(scope="module")
def datos():
    return json.loads(JSON_RUTA.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def filas():
    if CSV_RUTA is None:
        pytest.skip("No hay base local; corre src/preparar_datos.py")
    with open(CSV_RUTA, newline="", encoding="utf-8") as f:
        return [{k: int(float(v)) for k, v in r.items()} for r in csv.DictReader(f)]


def seg(filas, sid):
    bajo, alto = LIMITES[sid]
    return [r for r in filas if bajo < r["LIMIT_BAL"] <= alto] if sid != "todos" else filas


def grupo(p):
    return 0 if p <= 0 else (1 if p <= 2 else 2)


# ---------- Estructura (corren siempre, también en CI) ----------

def test_json_sin_valores_raros(datos):
    texto = JSON_RUTA.read_text(encoding="utf-8")
    assert "NaN" not in texto and "Infinity" not in texto
    assert datos["meta"]["clientes"] == 30000
    assert datos["meta"]["meses"] == MESES


def test_segmentos_suman_el_total(datos):
    for mes in MESES:
        todos = datos["meses"][mes]["todos"]
        for campo in ("clientes", "exposicion", "mora_1mas_clientes", "mora_2mas_clientes",
                      "mora_3mas_clientes"):
            suma = sum(datos["meses"][mes][f"l{i}"][campo] for i in range(1, 6))
            assert suma == todos[campo], (mes, campo)
        # La exposición se redondea por celda: se permite 1 unidad por segmento.
        assert abs(sum(datos["meses"][mes][f"l{i}"]["exposicion"] for i in range(1, 6)) - todos["exposicion"]) <= 5


def test_estados_y_bandas_suman_el_total(datos):
    for mes in MESES:
        for sid, c in datos["meses"][mes].items():
            assert sum(e["clientes"] for e in c["estados"]) == c["clientes"]
            assert sum(u["clientes"] for u in c["uso"]) == c["clientes"]
            assert abs(sum(e["exposicion"] for e in c["estados"]) - c["exposicion"]) <= len(c["estados"])
            assert abs(sum(u["exposicion"] for u in c["uso"]) - c["exposicion"]) <= len(c["uso"])
            assert c["mora_1mas_clientes"] >= c["mora_2mas_clientes"] >= c["mora_3mas_clientes"]
            assert 0 < c["top10_exposicion"] <= c["exposicion"]


def test_transiciones_suman_clientes(datos):
    assert datos["transiciones"]["abr"]["todos"] is None
    for mes in MESES[1:]:
        for sid, m in datos["transiciones"][mes].items():
            assert sum(map(sum, m)) == datos["meses"][mes][sid]["clientes"]


def test_alertas_coinciden_con_umbrales(datos):
    for a in datos["alertas"]:
        u = datos["umbrales"][a["indicador"]]
        esperado = "rojo" if a["valor"] >= u["rojo"] else "ambar" if a["valor"] >= u["ambar"] else "verde"
        assert a["estado"] == esperado
        assert 0 <= a["valor"] <= 100
    # 6 indicadores: 4 en los 6 meses y 2 desde mayo, por 6 segmentos
    assert len(datos["alertas"]) == (4 * 6 + 2 * 5) * 6


def test_umbrales_del_json_son_los_del_archivo_de_configuracion(datos):
    cfg = json.loads((RAIZ / "config" / "umbrales.json").read_text(encoding="utf-8"))["indicadores"]
    for k, v in cfg.items():
        assert datos["umbrales"][k]["ambar"] == v["ambar"] and datos["umbrales"][k]["rojo"] == v["rojo"]
        assert v["ambar"] < v["rojo"]


def test_umbral_configurable_cambia_el_semaforo():
    from generar_json import semaforo
    assert semaforo(9.9, 10, 15) == "verde"
    assert semaforo(10, 10, 15) == "ambar"
    assert semaforo(15, 10, 15) == "rojo"
    assert semaforo(9.9, 5, 8) == "rojo"


# ---------- Cuadre contra la base (necesitan el CSV) ----------

def test_totales_contra_la_base(datos, filas):
    assert len(filas) == 30000 == datos["meses"]["sep"]["todos"]["clientes"]
    for mes in MESES:
        c = datos["meses"][mes]["todos"]
        saldos = [max(r[BILL[mes]], 0) for r in filas]
        assert c["clientes"] == len(filas)
        assert abs(c["exposicion"] - sum(saldos)) <= 1
        assert c["mora_1mas_clientes"] == sum(r[PAY[mes]] >= 1 for r in filas)
        assert c["mora_2mas_clientes"] == sum(r[PAY[mes]] >= 2 for r in filas)
        assert c["mora_3mas_clientes"] == sum(r[PAY[mes]] >= 3 for r in filas)
        assert abs(c["mora_2mas_exposicion"] - sum(max(r[BILL[mes]], 0) for r in filas if r[PAY[mes]] >= 2)) <= 1


def test_porcentajes_contra_la_base(datos, filas):
    for mes in MESES:
        for sid in LIMITES:
            sub = seg(filas, sid)
            c = datos["meses"][mes][sid]
            assert c["clientes"] == len(sub)
            expo = sum(max(r[BILL[mes]], 0) for r in sub)
            esperado = round(100 * sum(max(r[BILL[mes]], 0) for r in sub if r[PAY[mes]] >= 2) / expo, 2)
            ale = next(a for a in datos["alertas"] if a["mes"] == mes and a["segmento"] == sid
                       and a["indicador"] == "mora_2mas_exposicion")
            assert ale["valor"] == pytest.approx(esperado, abs=0.011)
            k = math.ceil(0.1 * len(sub))
            top = sum(sorted((max(r[BILL[mes]], 0) for r in sub), reverse=True)[:k])
            assert c["top10_exposicion"] == pytest.approx(top, abs=1)


def test_estados_de_pago_y_uso_contra_la_base(datos, filas):
    for mes in ("abr", "sep"):
        c = datos["meses"][mes]["todos"]
        def est(p):
            return 0 if p <= -2 else 1 if p == -1 else 2 if p == 0 else min(p, 4) + 2
        for i in range(7):
            assert c["estados"][i]["clientes"] == sum(est(r[PAY[mes]]) == i for r in filas)
        def uso(r):
            s, u = r[BILL[mes]], r[BILL[mes]] / r["LIMIT_BAL"]
            return 0 if s <= 0 else 1 if u < 0.3 else 2 if u < 0.6 else 3 if u < 0.9 else 4
        for i in range(5):
            assert c["uso"][i]["clientes"] == sum(uso(r) == i for r in filas)


def test_roll_rates_contra_la_base(datos, filas):
    for i in range(1, 6):
        ant, mes = MESES[i - 1], MESES[i]
        m = [[0] * 3 for _ in range(3)]
        for r in filas:
            m[grupo(r[PAY[ant]])][grupo(r[PAY[mes]])] += 1
        assert datos["transiciones"][mes]["todos"] == m


def test_incumplimiento_del_mes_siguiente(datos, filas):
    c = datos["meses"]["sep"]["todos"]
    assert c["incumplen_siguiente_mes"] == sum(r["default"] for r in filas)
    assert sum(e["incumplen_siguiente_mes"] for e in c["estados"]) == c["incumplen_siguiente_mes"]
    assert "incumplen_siguiente_mes" not in datos["meses"]["ago"]["todos"]


# ---------- Seguridad de la página ----------

def archivos_web():
    return [p for p in (RAIZ / "web").rglob("*") if p.suffix in {".html", ".js", ".css"}]


def test_csp_estricta_en_el_html():
    html = (RAIZ / "web" / "index.html").read_text(encoding="utf-8")
    csp = re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', html).group(1)
    for parte in ("default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
                  "connect-src 'self'", "base-uri 'none'", "form-action 'none'"):
        assert parte in csp
    assert "unsafe" not in csp
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html), "no debe haber scripts en línea"
    assert " style=" not in html and "<style" not in html
    assert not re.search(r"\son\w+=", html), "no debe haber manejadores en línea"


def test_sin_patrones_peligrosos_ni_recursos_externos():
    for p in archivos_web():
        t = p.read_text(encoding="utf-8")
        assert "innerHTML" not in t and "outerHTML" not in t and "insertAdjacentHTML" not in t, p
        assert not re.search(r"\beval\s*\(|new Function|document\.write", t), p
        assert not re.search(r"(src|href)=\"https?://|url\(\s*['\"]?https?://|@import|fetch\(\s*['\"]https?:", t), p
