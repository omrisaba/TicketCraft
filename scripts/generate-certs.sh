#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="$(dirname "$0")/../server/certs"
mkdir -p "$CERT_DIR"

if command -v mkcert &>/dev/null; then
  echo "Using mkcert to generate trusted local certificates..."
  mkcert -install 2>/dev/null || true
  mkcert -key-file "$CERT_DIR/localhost.key" -cert-file "$CERT_DIR/localhost.crt" localhost 127.0.0.1 ::1
else
  echo "mkcert not found, using openssl for self-signed certificate..."
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERT_DIR/localhost.key" \
    -out "$CERT_DIR/localhost.crt" \
    -days 365 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"
fi

echo "Certificates generated in $CERT_DIR"
echo "  - $CERT_DIR/localhost.key"
echo "  - $CERT_DIR/localhost.crt"
