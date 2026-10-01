# -*- coding: utf-8 -*-
"""Geração de tiles XYZ a partir de um array georreferenciado em UTM.

Usado por gerar_tiles_aereas.py (ortofoto) e gerar_relevo.py (declividade).
A imagem é reprojetada para Web Mercator pixel a pixel e recortada em 256x256.
"""
import math, os, shutil
import numpy as np
from PIL import Image
from pyproj import Transformer

TAM = 256


def lonlat_para_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def resolucao(z, lat):
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** z)


def gerar(rgba, minx, maxy, px, epsg, saida, zmax, zmin=13, qualidade=78, mostrar=print):
    """rgba: array (h, w, 4) uint8 já na projeção UTM de origem (norte para cima).

    Devolve (limites_wgs84, qtd_arquivos, bytes).
    """
    alt_f, larg_f = rgba.shape[:2]
    maxx, miny = minx + larg_f * px, maxy - alt_f * px
    para_wgs = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    de_wgs = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    cantos = [para_wgs.transform(x, y) for x, y in
              ((minx, maxy), (maxx, maxy), (maxx, miny), (minx, miny))]
    lons = [c[0] for c in cantos]; lats = [c[1] for c in cantos]
    limites = [[min(lats), min(lons)], [max(lats), max(lons)]]

    if os.path.isdir(saida):
        shutil.rmtree(saida)

    x0f, y0f = lonlat_para_tile(min(lons), max(lats), zmax)
    x1f, y1f = lonlat_para_tile(max(lons), min(lats), zmax)
    tx0, tx1 = int(math.floor(x0f)), int(math.floor(x1f))
    ty0, ty1 = int(math.floor(y0f)), int(math.floor(y1f))
    n = 2 ** zmax
    jj = np.arange(TAM) + 0.5

    nivel = {}
    for tx in range(tx0, tx1 + 1):
        lon_e = tx / n * 360.0 - 180.0
        lon_d = (tx + 1) / n * 360.0 - 180.0
        lons_px = lon_e + jj * (lon_d - lon_e) / TAM
        for ty in range(ty0, ty1 + 1):
            ys = (ty * TAM + jj) / (n * TAM)
            lats_px = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * ys))))
            LON, LAT = np.meshgrid(lons_px, lats_px)
            X, Y = de_wgs.transform(LON, LAT)
            col = (X - minx) / px
            row = (maxy - Y) / px
            dentro = (col >= 0) & (col < larg_f) & (row >= 0) & (row < alt_f)
            if not dentro.any():
                continue
            ci = np.clip(col.astype(np.int32), 0, larg_f - 1)
            ri = np.clip(row.astype(np.int32), 0, alt_f - 1)
            arr = rgba[ri, ci].copy()
            arr[..., 3] = np.where(dentro, arr[..., 3], 0)
            if not arr[..., 3].any():
                continue
            nivel[(tx, ty)] = arr
    mostrar(f"  zoom {zmax}: {len(nivel)} tiles")

    def salvar(z, tiles):
        for (tx, ty), arr in tiles.items():
            d = os.path.join(saida, str(z), str(tx))
            os.makedirs(d, exist_ok=True)
            Image.fromarray(arr, "RGBA").save(
                os.path.join(d, f"{ty}.webp"), "WEBP", quality=qualidade, method=4)

    salvar(zmax, nivel)
    for z in range(zmax - 1, zmin - 1, -1):
        pais = {}
        for (tx, ty), arr in nivel.items():
            chave = (tx // 2, ty // 2)
            p = pais.setdefault(chave, np.zeros((TAM * 2, TAM * 2, 4), np.uint8))
            p[(ty % 2) * TAM:(ty % 2 + 1) * TAM, (tx % 2) * TAM:(tx % 2 + 1) * TAM] = arr
        nivel = {}
        for chave, p in pais.items():
            q = p.reshape(TAM, 2, TAM, 2, 4).astype(np.uint16)
            w = q[..., 3:4]
            soma = w.sum(axis=(1, 3))
            cor = (q[..., :3] * w).sum(axis=(1, 3))
            cor = np.where(soma > 0, cor // np.maximum(soma, 1), 0)
            alpha = w.sum(axis=(1, 3)) // 4
            nivel[chave] = np.dstack([cor.astype(np.uint8), alpha.astype(np.uint8)])
        salvar(z, nivel)
        mostrar(f"  zoom {z}: {len(nivel)} tiles")

    arquivos = sum(len(f) for _, _, f in os.walk(saida))
    tam = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(saida) for f in fs)
    return limites, arquivos, tam
