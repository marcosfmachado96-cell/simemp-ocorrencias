# -*- coding: utf-8 -*-
"""Gera os ícones da PWA (app/icons): rodovia estilizada + losango de alerta."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "app", "icons")
os.makedirs(OUT, exist_ok=True)

NAVY = (16, 41, 77, 255)
NAVY2 = (23, 58, 107, 255)
AMBER = (242, 169, 0, 255)
WHITE = (255, 255, 255, 255)

def icone(tam, arredondar=True):
    S = 4  # supersampling para bordas suaves
    t = tam * S
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(t * 0.22) if arredondar else 0
    d.rounded_rectangle([0, 0, t, t], radius=r, fill=NAVY)
    # faixa diagonal mais clara (profundidade)
    d.polygon([(0, t * 0.62), (t, t * 0.28), (t, t), (0, t)], fill=NAVY2)
    # rodovia: trapézio em perspectiva
    d.polygon([(t * 0.40, t * 0.86), (t * 0.60, t * 0.86), (t * 0.54, t * 0.36), (t * 0.46, t * 0.36)], fill=(230, 236, 244, 255))
    # tracejado central
    for y0, y1, w in ((0.78, 0.84, 0.014), (0.64, 0.70, 0.011), (0.52, 0.57, 0.008), (0.42, 0.46, 0.006)):
        d.rectangle([t * (0.5 - w), t * y0, t * (0.5 + w), t * y1], fill=NAVY)
    # losango de alerta
    cx, cy, h = t * 0.70, t * 0.30, t * 0.17
    d.polygon([(cx, cy - h), (cx + h, cy), (cx, cy + h), (cx - h, cy)], fill=AMBER)
    hi = h * 0.72
    d.polygon([(cx, cy - hi), (cx + hi, cy), (cx, cy + hi), (cx - hi, cy)], outline=NAVY, width=int(t * 0.012), fill=AMBER)
    w = t * 0.022
    d.rounded_rectangle([cx - w, cy - h * 0.48, cx + w, cy + h * 0.12], radius=w, fill=NAVY)
    d.ellipse([cx - w, cy + h * 0.24, cx + w, cy + h * 0.24 + 2 * w], fill=NAVY)
    return img.resize((tam, tam), Image.LANCZOS)

for tam, nome, arred in ((192, "icon-192.png", True), (512, "icon-512.png", True), (180, "apple-touch-icon.png", False), (64, "logo-64.png", True)):
    icone(tam, arred).save(os.path.join(OUT, nome))
    print("ok", nome)
