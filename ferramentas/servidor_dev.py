# -*- coding: utf-8 -*-
"""Servidor de desenvolvimento: serve a pasta app/ e aceita POST /_salvar?nome=x para gravar arquivos de teste."""
import os, sys, http.server, urllib.parse
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, "..", "_testes")
PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=RAIZ, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/_salvar": self.send_error(404); return
        nome = urllib.parse.parse_qs(u.query).get("nome", ["arquivo.bin"])[0]
        n = int(self.headers.get("Content-Length", 0)); dados = self.rfile.read(n)
        os.makedirs(SAIDA, exist_ok=True)
        with open(os.path.join(SAIDA, os.path.basename(nome)), "wb") as f: f.write(dados)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), H).serve_forever()
