# -*- coding: utf-8 -*-
"""Carimba a versão nos scripts e estilos dos HTMLs (cache busting).

Cada versão publicada passa a ter URLs próprias (ex.: js/app.js?v=1.4.1), então o
navegador nunca serve um arquivo antigo junto com um novo. Rodar antes de publicar:
    python ferramentas/versionar.py
"""
import io, os, re

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")

versao = re.search(r"VERSAO:\s*'([^']+)'", io.open(os.path.join(BASE, "js", "config.js"), encoding="utf-8").read()).group(1)

alvo = re.compile(r'((?:src|href)=")((?:js|css)/[\w.-]+)(?:\?v=[\w.-]+)?(")')
for nome in ("index.html", "painel.html"):
    p = os.path.join(BASE, nome)
    s = io.open(p, encoding="utf-8").read()
    novo = alvo.sub(lambda m: f'{m.group(1)}{m.group(2)}?v={versao}{m.group(3)}', s)
    if novo != s:
        io.open(p, "w", encoding="utf-8").write(novo)
    print(f"{nome}: {len(alvo.findall(novo))} arquivos marcados com v={versao}")

# o cache do service worker acompanha a versão
p = os.path.join(BASE, "sw.js")
s = io.open(p, encoding="utf-8").read()
s2 = re.sub(r"const CACHE = 'simemp-v[^']+';", f"const CACHE = 'simemp-v{versao}';", s)
if s2 != s:
    io.open(p, "w", encoding="utf-8").write(s2)
print("sw.js: cache simemp-v" + versao)
