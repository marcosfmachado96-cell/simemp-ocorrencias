# -*- coding: utf-8 -*-
"""Transforma um modelo digital de elevação (DEM/DSM) em camadas para o painel:

  - curvas de nível (GeoJSON: normais e mestras)
  - grade de altitude (arquivo binário) para consultar altitude e declividade no clique
  - camada de declividade colorida (tiles XYZ)

Uso:
    python ferramentas/gerar_relevo.py <DEM.tif> --id pr092-km70 \
        --nome "PR-092 km 70 — Cerro Azul" --data 2026-09-28 \
        [--equidistancia 1] [--mestra 5] [--celula 1.0] [--sem-declividade]

Observação: DEM de drone sem classificação é um modelo de SUPERFÍCIE (DSM) — em
mata fechada as curvas acompanham a copa das árvores, não o solo. Em áreas
expostas (pista, taludes, escorregamentos) representa o terreno.
"""
import argparse, json, math, os, sys
import numpy as np
from pyproj import Transformer
import tifffile
import _tiles

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def ler_dem(caminho):
    with tifffile.TiffFile(caminho) as t:
        p = t.pages[0]
        tags = p.tags
        escala = tags["ModelPixelScaleTag"].value
        tie = tags["ModelTiepointTag"].value
        geo = tags["GeoAsciiParamsTag"].value if "GeoAsciiParamsTag" in tags else ""
        a = p.asarray()
    a = np.where((a > -1000) & (a < 9000), a, np.nan).astype(np.float32)
    return a, float(tie[3]), float(tie[4]), float(escala[0]), geo


def media_blocos(a, b):
    """Reduz por média, ignorando buracos (nan)."""
    h, w = a.shape
    a = a[:h // b * b, :w // b * b]
    bloco = a.reshape(h // b, b, w // b, b)
    with np.errstate(invalid="ignore"):
        return np.nanmean(bloco, axis=(1, 3))


def suavizar(z, passos=1):
    """Média 3x3 preservando buracos (reduz a granulação da vegetação)."""
    for _ in range(passos):
        v = np.nan_to_num(z, nan=0.0)
        m = np.isfinite(z).astype(np.float32)
        soma = np.zeros_like(v); cont = np.zeros_like(v)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                soma += np.roll(np.roll(v, dy, 0), dx, 1)
                cont += np.roll(np.roll(m, dy, 0), dx, 1)
        z = np.where(cont > 0, soma / np.maximum(cont, 1), np.nan)
        z = np.where(np.isfinite(z), z, np.nan)
    return z


def declividade_graus(z, celula):
    gy, gx = np.gradient(np.nan_to_num(z, nan=np.nanmedian(z)), celula)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def cor_declividade(d):
    """Verde (suave) -> amarelo -> laranja -> vermelho (muito íngreme)."""
    paradas = [(0, (26, 152, 80)), (15, (166, 217, 106)), (27, (254, 224, 139)),
               (35, (253, 141, 60)), (45, (227, 26, 28)), (60, (128, 0, 38))]
    d = np.clip(d, 0, 60)
    r = np.zeros_like(d); g = np.zeros_like(d); b = np.zeros_like(d)
    for (v0, c0), (v1, c1) in zip(paradas, paradas[1:]):
        m = (d >= v0) & (d <= v1)
        t = (d[m] - v0) / (v1 - v0)
        r[m] = c0[0] + t * (c1[0] - c0[0])
        g[m] = c0[1] + t * (c1[1] - c0[1])
        b[m] = c0[2] + t * (c1[2] - c0[2])
    return np.dstack([r, g, b]).astype(np.uint8)


def contornos_geojson(z, minx, maxy, celula, niveis, para_wgs, tolerancia_m):
    """Extrai curvas de nível e devolve feições GeoJSON em lat/lon."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    h, w = z.shape
    xs = minx + (np.arange(w) + 0.5) * celula
    ys = maxy - (np.arange(h) + 0.5) * celula
    fig = plt.figure()
    cs = plt.contour(xs, ys, np.ma.masked_invalid(z), levels=niveis)
    feicoes = []
    for nivel, caminho in zip(cs.levels, cs.get_paths()):
        for poly in caminho.to_polygons(closed_only=False):
            if len(poly) < 3:
                continue
            poly = simplificar(poly, tolerancia_m)
            if len(poly) < 2:
                continue
            lon, lat = para_wgs.transform(poly[:, 0], poly[:, 1])
            coords = [[round(float(a), 6), round(float(b), 6)] for a, b in zip(lon, lat)]
            feicoes.append({
                "type": "Feature",
                "properties": {"alt": round(float(nivel), 1)},
                "geometry": {"type": "LineString", "coordinates": coords},
            })
    plt.close(fig)
    return feicoes


def simplificar(pts, tol):
    """Douglas-Peucker (as coordenadas estão em metros)."""
    if len(pts) < 3:
        return pts
    manter = np.zeros(len(pts), bool); manter[0] = manter[-1] = True
    pilha = [(0, len(pts) - 1)]
    while pilha:
        i, j = pilha.pop()
        a, b = pts[i], pts[j]
        seg = b - a
        L2 = seg.dot(seg)
        if L2 == 0:
            d = np.linalg.norm(pts[i + 1:j] - a, axis=1)
        else:
            t = np.clip(((pts[i + 1:j] - a) @ seg) / L2, 0, 1)
            d = np.linalg.norm(pts[i + 1:j] - (a + t[:, None] * seg), axis=1)
        if len(d) and d.max() > tol:
            k = i + 1 + int(d.argmax())
            manter[k] = True
            pilha += [(i, k), (k, j)]
    return pts[manter]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dem")
    ap.add_argument("--id", required=True)
    ap.add_argument("--nome", required=True)
    ap.add_argument("--data", default="")
    ap.add_argument("--celula", type=float, default=1.0, help="tamanho da célula de trabalho (m)")
    ap.add_argument("--equidistancia", type=float, default=1.0, help="curvas normais (m)")
    ap.add_argument("--mestra", type=float, default=5.0, help="curvas mestras (m)")
    ap.add_argument("--suavizar", type=int, default=2, help="passos de suavização 3x3")
    ap.add_argument("--zmax", type=int, default=20)
    ap.add_argument("--sem-declividade", action="store_true")
    a = ap.parse_args()

    print("lendo o modelo de elevação…")
    z0, minx, maxy, px, geo = ler_dem(a.dem)
    epsg = 31982 if "UTM zone 22S" in geo and "SIRGAS 2000" in geo else None
    if epsg is None:
        sys.exit(f"sistema de coordenadas não reconhecido: {geo!r}")
    print(f"  {z0.shape[1]}x{z0.shape[0]} px · {px*100:.2f} cm/px · "
          f"{np.isfinite(z0).mean()*100:.0f}% com dados")

    b = max(1, int(round(a.celula / px)))
    z = media_blocos(z0, b)
    celula = px * b
    del z0
    z = suavizar(z, a.suavizar)
    h, w = z.shape
    validos = np.isfinite(z)
    zmin, zmax_alt = float(np.nanmin(z)), float(np.nanmax(z))
    print(f"  grade de trabalho: {w}x{h} · {celula:.2f} m/célula · "
          f"altitude {zmin:.1f} a {zmax_alt:.1f} m")

    para_wgs = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    destino = os.path.join(BASE, "app", "relevo", a.id)
    os.makedirs(destino, exist_ok=True)
    registro = {"id": a.id, "nome": a.nome, "data": a.data,
                "altitude_min": round(zmin, 1), "altitude_max": round(zmax_alt, 1),
                "equidistancia": a.equidistancia, "mestra": a.mestra}

    # ---------- grade de altitude (consulta de altitude e declividade) ----------
    grade = np.where(validos, z, -9999).astype("<f4")
    with open(os.path.join(destino, "altitude.bin"), "wb") as f:
        f.write(grade.tobytes())
    cantos = [para_wgs.transform(x, y) for x, y in
              ((minx, maxy), (minx + w * celula, maxy - h * celula))]
    registro["grade"] = {
        "arquivo": f"relevo/{a.id}/altitude.bin",
        "largura": w, "altura": h, "celula": round(celula, 4),
        "utm_minx": round(minx, 3), "utm_maxy": round(maxy, 3), "epsg": epsg,
        "limites": [[min(c[1] for c in cantos), min(c[0] for c in cantos)],
                    [max(c[1] for c in cantos), max(c[0] for c in cantos)]],
        "sem_dado": -9999,
    }
    print(f"  altitude.bin: {grade.nbytes/1e6:.1f} MB")

    # ---------- curvas de nível ----------
    n0 = math.floor(zmin / a.equidistancia) * a.equidistancia
    niveis = np.arange(n0, zmax_alt + a.equidistancia, a.equidistancia)
    print(f"curvas de nível: {len(niveis)} níveis de {a.equidistancia} m…")
    feicoes = contornos_geojson(z, minx, maxy, celula, niveis, para_wgs, celula * 0.75)
    for f in feicoes:
        f["properties"]["mestra"] = abs(f["properties"]["alt"] / a.mestra -
                                        round(f["properties"]["alt"] / a.mestra)) < 1e-6
    gj = {"type": "FeatureCollection", "features": feicoes}
    cam = os.path.join(destino, "curvas.geojson")
    json.dump(gj, open(cam, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    vert = sum(len(f["geometry"]["coordinates"]) for f in feicoes)
    print(f"  {len(feicoes)} linhas · {vert} vértices · {os.path.getsize(cam)/1e6:.1f} MB")
    registro["curvas"] = f"relevo/{a.id}/curvas.geojson"

    # ---------- declividade ----------
    if not a.sem_declividade:
        print("declividade…")
        d = declividade_graus(z, celula)
        rgb = cor_declividade(d)
        alpha = np.where(validos, 200, 0).astype(np.uint8)
        rgba = np.dstack([rgb, alpha])
        limites, arqs, tam = _tiles.gerar(rgba, minx, maxy, celula, epsg,
                                          os.path.join(BASE, "app", "relevo", a.id, "declividade"),
                                          zmax=a.zmax, mostrar=lambda s: print(s))
        dv = d[validos]
        print(f"  {arqs} tiles · {tam/1e6:.1f} MB · mediana {np.median(dv):.0f}°, "
              f"{(dv > 45).mean()*100:.0f}% acima de 45°")
        registro["declividade"] = {"url": f"relevo/{a.id}/declividade/{{z}}/{{x}}/{{y}}.webp",
                                   "limites": limites, "zmin": 13, "zmax": a.zmax}

    # ---------- registro ----------
    cam = os.path.join(BASE, "app", "data", "relevo.json")
    lista = json.load(open(cam, encoding="utf-8")) if os.path.exists(cam) else []
    lista = [c for c in lista if c["id"] != a.id]
    lista.append(registro)
    lista.sort(key=lambda c: (c.get("data") or "", c["nome"]))
    json.dump(lista, open(cam, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    total = sum(os.path.getsize(os.path.join(r, f))
                for r, _, fs in os.walk(destino) for f in fs)
    print(f"\ntotal em app/relevo/{a.id}: {total/1e6:.1f} MB")


if __name__ == "__main__":
    main()
