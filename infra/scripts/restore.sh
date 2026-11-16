#!/usr/bin/env sh
# Restaura un backup generado por backup.sh. ATENCIÓN: reemplaza los datos actuales de la base.
# Uso:  ./infra/scripts/restore.sh backups/facturacion-AAAAMMDD-HHMMSS.dump
set -eu

FILE="${1:?Indique el archivo .dump a restaurar}"
[ -f "$FILE" ] || { echo "No existe $FILE"; exit 1; }

# shellcheck disable=SC1091
[ -f .env ] && . ./.env
DB_USER="${POSTGRES_USER:-facturacion}"
DB_NAME="${POSTGRES_DB:-facturacion}"

printf 'Se restaurará %s sobre la base "%s". Escriba RESTAURAR para continuar: ' "$FILE" "$DB_NAME"
read -r answer
[ "$answer" = "RESTAURAR" ] || { echo "Cancelado"; exit 1; }

docker compose stop api
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$FILE"
docker compose start api
echo "Restauración completada."
