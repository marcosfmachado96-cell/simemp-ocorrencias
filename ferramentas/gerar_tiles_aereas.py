# -*- coding: utf-8 -*-
"""Transforma uma ortofoto georreferenciada em camada de mapa (tiles XYZ) para o painel.

A imagem é reprojetada de UTM (SIRGAS 2000) para Web Mercator e recortada em
quadradinhos de 256 px, como o mapa de fundo. Assim o navegador carrega só o
pedaço visível, e uma ortofoto de centenas de megapixels abre instantaneamente.

Uso:
    python ferramentas/gerar_tiles_aereas.py <imagem> --id pr092-km70 \
        --nome "PR-092 km 70 — Cerro Azul" --data 2026-09-28 [--zmax 21]

Lê a georreferência das tags GeoTIFF (embutidas no TIFF ou no EXIF do JPEG).
Gera em app/aereas/<id>/{z}/{x}/{y}.webp e registra em app/data/aereas.json.
"""
import argparse, io, json, math, os, sys, shutil
import numpy as np
from PIL import Image
from pyproj import Transformer

Image.MAX_IMAGE_PIXELS = None
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TAM = 256  # lado do tile, em pixels


def georreferencia(caminho):
    """Devolve (minx, maxy, escala_px, epsg, largura, altura) lendo as tags GeoTIFF."""
    im = Image.open(caminho)
    W, H = im.size
    escala = tie = None
    if caminho.lower().endswith((".tif", ".tiff")):
        import tifffile
        with tifffile.TiffFile(caminho) as t:
            tags = t.pages[0].tags
            escala = tags["ModelPixelScaleTag"].value
            tie = tags["ModelTiepointTag"].value
            geo = tags["GeoAsciiParamsTag"].value if "GeoAsciiParamsTag" in tags else ""
    else:
        ex = im.getexif()
        escala, tie = ex.get(33550), ex.get(33922)
        geo = ex.get(34737, "")
    if not escala or not tie:
        sys.exit("Imagem sem georreferência (tags GeoTIFF 33550/33922 ausentes).")
    if "UTM zone 22S" not in geo or "SIRGAS 2000" not in geo:
        print(f"AVISO: sistema de coordenadas inesperado: {geo!r} — confira o resultado.")
    return float(tie[3]), float(tie[4]), float(escala[0]), 31982, W, H


def carregar(caminho, alvo_px, minx, maxy, px):
    """Carrega a imagem reduzida para perto da resolução do zoom máximo (economiza memória)."""
    im = Image.open(caminho)
    fator = 1
    while fator < 8 and px * fator * 2 <= alvo_px * 1.05:
        fator *= 2
    if fator > 1:
        im.draft("RGB", (im.size[0] // fator, im.size[1] // fator))
    im = im.convert("RGB")
    real = (Image.open(caminho).size[0] / im.size[0])
    print(f"  imagem carregada em {im.size[0]}x{im.size[1]} (1/{real:.0f} do original, "
          f"{px*real*100:.1f} cm/px)")
    return np.asarray(im), px * real


def lonlat_para_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("imagem")
    ap.add_argument("--id", required=True, help="identificador curto (pasta)")
    ap.add_argument("--nome", required=True, help="nome exibido no painel")
    ap.add_argument("--data", default="", help="data do voo (AAAA-MM-DD)")
    ap.add_argument("--zmax", type=int, default=21, help="zoom máximo (21 ≈ 7 cm/px)")
    ap.add_argument("--zmin", type=int, default=13)
    ap.add_argument("--qualidade", type=int, default=78)
    ap.add_argument("--fundo-branco", type=int, default=250,
                    help="pixels com R,G,B acima disso viram transparentes (0 desliga)")
    a = ap.parse_args()

    minx, maxy, px, epsg, W, H = georreferencia(a.imagem)
    maxx, miny = minx + W * px, maxy - H * px
    para_wgs = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    de_wgs = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    cantos = [para_wgs.transform(x, y) for x, y in
              ((minx, maxy), (maxx, maxy), (maxx, miny), (minx, miny))]
    lons = [c[0] for c in cantos]; lats = [c[1] for c in cantos]
    limites = [[min(lats), min(lons)], [max(lats), max(lons)]]
    print(f"área: {W*px:.0f} x {H*px:.0f} m · {px*100:.2f} cm/px · {W*H/1e6:.0f} MP")

    # resolução do zoom máximo nesta latitude
    latc = (min(lats) + max(lats)) / 2
    res_zmax = 156543.03392 * math.cos(math.radians(latc)) / (2 ** a.zmax)
    fonte, px_fonte = carregar(a.imagem, res_zmax, minx, maxy, px)
    alt_f, larg_f = fonte.shape[:2]

    saida = os.path.join(BASE, "app", "aereas", a.id)
    if os.path.isdir(saida):
        shutil.rmtree(saida)

    # ---- nível máximo: reprojeta da imagem fonte ----
    x0f, y0f = lonlat_para_tile(min(lons), max(lats), a.zmax)
    x1f, y1f = lonlat_para_tile(max(lons), min(lats), a.zmax)
    tx0, tx1 = int(math.floor(x0f)), int(math.floor(x1f))
    ty0, ty1 = int(math.floor(y0f)), int(math.floor(y1f))
    n = 2 ** a.zmax
    total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    print(f"zoom {a.zmax}: até {total} tiles ({res_zmax*100:.1f} cm/px)")

    nivel = {}   # (x, y) -> array RGBA
    feitos = 0
    jj = (np.arange(TAM) + 0.5)
    for tx in range(tx0, tx1 + 1):
        lon_e = tx / n * 360.0 - 180.0
        lon_d = (tx + 1) / n * 360.0 - 180.0
        lons_px = lon_e + jj * (lon_d - lon_e) / TAM
        for ty in range(ty0, ty1 + 1):
            ys = (ty * TAM + jj) / (n * TAM)
            lats_px = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * ys))))
            LON, LAT = np.meshgrid(lons_px, lats_px)
            X, Y = de_wgs.transform(LON, LAT)
            col = (X - minx) / px_fonte
            row = (maxy - Y) / px_fonte
            dentro = (col >= 0) & (col < larg_f) & (row >= 0) & (row < alt_f)
            if not dentro.any():
                continue
            ci = np.clip(col.astype(np.int32), 0, larg_f - 1)
            ri = np.clip(row.astype(np.int32), 0, alt_f - 1)
            rgb = fonte[ri, ci]
            alpha = np.where(dentro, 255, 0).astype(np.uint8)
            if a.fundo_branco:
                alpha[(rgb >= a.fundo_branco).all(axis=2)] = 0
            if not alpha.any():
                continue
            nivel[(tx, ty)] = np.dstack([rgb, alpha])
            feitos += 1
    print(f"  {feitos} tiles com imagem")

    def salvar(z, tiles):
        for (tx, ty), arr in tiles.items():
            d = os.path.join(saida, str(z), str(tx))
            os.makedirs(d, exist_ok=True)
            Image.fromarray(arr, "RGBA").save(
                os.path.join(d, f"{ty}.webp"), "WEBP", quality=a.qualidade, method=4)

    salvar(a.zmax, nivel)

    # ---- níveis menores: média 2x2 do nível de cima ----
    for z in range(a.zmax - 1, a.zmin - 1, -1):
        pais = {}
        for (tx, ty), arr in nivel.items():
            chave = (tx // 2, ty // 2)
            p = pais.setdefault(chave, np.zeros((TAM * 2, TAM * 2, 4), np.uint8))
            p[(ty % 2) * TAM:(ty % 2 + 1) * TAM, (tx % 2) * TAM:(tx % 2 + 1) * TAM] = arr
        nivel = {}
        for chave, p in pais.items():
            q = p.reshape(TAM, 2, TAM, 2, 4).astype(np.uint16)
            # média ponderada pelo alpha, para a borda não escurecer
            w = q[..., 3:4]
            soma_w = w.sum(axis=(1, 3))
            cor = (q[..., :3] * w).sum(axis=(1, 3))
            cor = np.where(soma_w > 0, cor // np.maximum(soma_w, 1), 0)
            alpha = (w.sum(axis=(1, 3)) // 4)
            nivel[chave] = np.dstack([cor.astype(np.uint8), alpha.astype(np.uint8)])
        salvar(z, nivel)
        print(f"zoom {z}: {len(nivel)} tiles")

    # ---- registro das camadas ----
    reg_caminho = os.path.join(BASE, "app", "data", "aereas.json")
    registro = []
    if os.path.exists(reg_caminho):
        registro = json.load(open(reg_caminho, encoding="utf-8"))
    registro = [c for c in registro if c["id"] != a.id]
    registro.append({
        "id": a.id, "nome": a.nome, "data": a.data,
        "url": f"aereas/{a.id}/{{z}}/{{x}}/{{y}}.webp",
        "limites": limites, "zmin": a.zmin, "zmax": a.zmax,
        "resolucao_cm": round(px * 100, 2),
    })
    registro.sort(key=lambda c: (c.get("data") or "", c["nome"]))
    json.dump(registro, open(reg_caminho, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    arquivos = sum(len(f) for _, _, f in os.walk(saida))
    tam = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(saida) for f in fs)
    print(f"\n{arquivos} tiles · {tam/1e6:.1f} MB em app/aereas/{a.id}")
    print(f"limites: {limites}")


if __name__ == "__main__":
    main()
