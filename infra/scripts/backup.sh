#!/usr/bin/env sh
# Backup lógico de PostgreSQL (formato custom, comprimido) desde el contenedor de docker compose.
# Uso:  ./infra/scripts/backup.sh [directorio_destino]
# Programar con cron, p. ej.:  0 3 * * * cd /opt/facturacion && ./infra/scripts/backup.sh /backups
set -eu

DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

# shellcheck disable=SC1091
[ -f .env ] && . ./.env
DB_USER="${POSTGRES_USER:-facturacion}"
DB_NAME="${POSTGRES_DB:-facturacion}"
FILE="$DEST/facturacion-$STAMP.dump"

docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner > "$FILE"
echo "Backup generado: $FILE ($(du -h "$FILE" | cut -f1))"

# Retención: conserva los últimos 14 backups.
ls -1t "$DEST"/facturacion-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
