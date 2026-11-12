"""Descarga la base pública y la convierte a CSV.

Fuente: UCI Machine Learning Repository, "Default of Credit Card Clients"
(Yeh y Lien, 2009). Son clientes de tarjeta de crédito de Taiwán, abril a
septiembre de 2005. No contiene datos de ningún banco mexicano."""
import hashlib
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
URL = "https://archive.ics.uci.edu/static/public/350/default+of+credit+card+clients.zip"
# Suma SHA-256 del archivo original. Si UCI lo cambia, el paso se detiene para revisarlo.
SHA256 = "56c885f84457f6680f8438f02bfcdac9579323d8a94465ee5f26e32baa727602"
ARCHIVO = "default of credit card clients.xls"


def main() -> None:
    carpeta = RAIZ / "datos"
    carpeta.mkdir(exist_ok=True)
    destino = carpeta / "uci_default.zip"
    if not destino.exists():
        with urllib.request.urlopen(URL, timeout=60) as r:
            destino.write_bytes(r.read())
    if hashlib.sha256(destino.read_bytes()).hexdigest() != SHA256:
        raise SystemExit("La suma de verificación del archivo descargado no coincide. "
                         "Revisa que sea la base original antes de continuar.")
    with zipfile.ZipFile(destino) as z:
        z.extract(ARCHIVO, carpeta)  # solo el archivo esperado
    df = pd.read_excel(carpeta / ARCHIVO, header=1, engine="xlrd")
    df = df.rename(columns={"default payment next month": "default"})
    df.to_csv(carpeta / "credito_tarjetas.csv", index=False)
    print(f"Base lista: {df.shape[0]:,} clientes y {df.shape[1]} columnas")


if __name__ == "__main__":
    main()
