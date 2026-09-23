# -*- coding: utf-8 -*-
"""
Gera os arquivos GeoJSON da malha rodoviária a partir do shapefile SRE-PR.
  app/data/malha_leste.geojson  -> SR1 Leste = S.R. Leste + Esc. Médio Iguaçu + Esc. Xisto, tolerância 5 m (celular, offline)
  app/data/malha_pr.geojson     -> estado inteiro, tolerância 30 m (painel desktop, só contexto)
Uso:  python ferramentas/gerar_malha.py
"""
import json, os, sys
import shapefile
from pyproj import Transformer

BASE = os.path.join(os.path.dirname(__file__), "..")
SHP = os.path.join(BASE, "SRE_2024_Atualizado", "SRE_2022_UTM_SIRGAS2000_22S_LN_FINAL")
OUT = os.path.join(BASE, "app", "data")

tr = Transformer.from_crs("EPSG:31982", "EPSG:4326", always_xy=True)

def fix(s):
    if not isinstance(s, str): return s
    try: return s.encode("latin-1").decode("utf-8").strip()
    except Exception: return s.strip()

def simplify(pts, tol):
    """Douglas-Peucker em coordenadas UTM (metros)."""
    if len(pts) < 3: return pts
    def dist(p, a, b):
        ax, ay = a; bx, by = b; px, py = p
        dx, dy = bx-ax, by-ay
        if dx == dy == 0: return ((px-ax)**2 + (py-ay)**2) ** .5
        t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx+dy*dy)))
        return ((px-ax-t*dx)**2 + (py-ay-t*dy)**2) ** .5
    stack = [(0, len(pts)-1)]; keep = [False]*len(pts); keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        dmax, idx = 0, -1
        for k in range(i+1, j):
            d = dist(pts[k], pts[i], pts[j])
            if d > dmax: dmax, idx = d, k
        if dmax > tol:
            keep[idx] = True; stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]

def sentido(pista):
    # SRE: "Direita - sentido crescente da rodovia" / "Esquerda - sentido decrescente"
    if pista.startswith("Direita"): return "direita"
    if pista.startswith("Esquerda"): return "esquerda"
    return "ambos"

def build(filtro, tol, completo):
    sf = shapefile.Reader(SHP, encoding="latin-1", encodingErrors="replace")
    feats = []
    for sr in sf.iterShapeRecords():
        r = sr.record
        if not filtro(r): continue
        pts = simplify(sr.shape.points, tol)
        coords = [[round(lon, 6), round(lat, 6)] for lon, lat in (tr.transform(x, y) for x, y in pts)]
        props = {
            "rod": fix(r["_Sigla Rod"]),
            "trecho": fix(r["Trecho"]),
            "km_ini": r["Km_Inicial"], "km_fim": r["Km_Final"],
            "sentido": sentido(fix(r["_PISTA"])),
        }
        if completo:
            props.update({
                "de": fix(r["De"]), "para": fix(r["Para"]),
                "municipio": fix(r["_NMMUNICIP"]),
                "situacao": fix(r["Situacao"]),
                "pista": fix(r["_PISTA"]) or "Simples",
                "resp": fix(r["Resp"]),
                "reg": fix(r["Esc_Reg"]),
                "juris": fix(r["Jurisdicao"]),
            })
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "LineString", "coordinates": coords}})
    return {"type": "FeatureCollection", "features": feats}

os.makedirs(OUT, exist_ok=True)
SR1 = ("S.R. Leste", "Médio Iguaçu", "Xisto")
leste = build(lambda r: fix(r["Esc_Reg"]) in SR1, 5, True)
with open(os.path.join(OUT, "malha_leste.geojson"), "w", encoding="utf-8") as f:
    json.dump(leste, f, ensure_ascii=False, separators=(",", ":"))
pr = build(lambda r: True, 30, False)
with open(os.path.join(OUT, "malha_pr.geojson"), "w", encoding="utf-8") as f:
    json.dump(pr, f, ensure_ascii=False, separators=(",", ":"))

for n in ("malha_leste.geojson", "malha_pr.geojson"):
    p = os.path.join(OUT, n)
    print(f"{n}: {os.path.getsize(p)//1024} KB")
print("trechos leste:", len(leste["features"]), "| vértices:", sum(len(f['geometry']['coordinates']) for f in leste['features']))
print("trechos PR:", len(pr["features"]), "| vértices:", sum(len(f['geometry']['coordinates']) for f in pr['features']))
