#!/usr/bin/env python3
"""Serve the project over HTTPS with a locally-trusted certificate.

Uses mkcert if available (trusted by browsers), falls back to openssl self-signed.

WebHID/WebUSB require a secure context — HTTPS for non-localhost IPs.
Run:  make serve-https
"""
import http.server
import os
import shutil
import socket
import ssl
import subprocess
import sys


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def ensure_cert():
    certfile = "cert.pem"
    keyfile = "key.pem"
    if os.path.exists(certfile) and os.path.exists(keyfile):
        return certfile, keyfile

    mkcert = shutil.which("mkcert")
    if mkcert:
        print("Using mkcert to generate locally-trusted certificate...")
        ips = ["localhost", "127.0.0.1", get_local_ip(), "::1"]
        subprocess.run(
            [mkcert, "-cert-file", certfile, "-key-file", keyfile] + ips,
            check=True,
        )
        rootca = subprocess.run(
            [mkcert, "-CAROOT"], capture_output=True, text=True
        ).stdout.strip()
        if rootca:
            src = os.path.join(rootca, "rootCA.pem")
            if os.path.exists(src):
                shutil.copy2(src, "rootCA.pem")
                print(f"\n  CA certificate copied to rootCA.pem")
                print(f"  Import this into your browser's trusted root CAs if needed.\n")
    else:
        print("mkcert not found — generating self-signed certificate (browsers will warn)...")
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", keyfile, "-out", certfile,
            "-days", "365", "-nodes",
            "-subj", "/CN=web-swd-flasher",
        ], check=True, capture_output=True)

    return certfile, keyfile


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
    certfile, keyfile = ensure_cert()
    ip = get_local_ip()

    handler = http.server.SimpleHTTPRequestHandler
    with http.server.HTTPServer(("0.0.0.0", port), handler) as httpd:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile, keyfile)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        print(f"  HTTPS server running:")
        print(f"    Local:   https://localhost:{port}")
        print(f"    Network: https://{ip}:{port}")
        print(f"")
        print(f"  To trust the certificate on other devices, import")
        print(f"  rootCA.pem into the browser's trusted root CAs.")
        print(f"  See LOCAL_DEV.md for detailed instructions.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("Server stopped.")


if __name__ == "__main__":
    main()