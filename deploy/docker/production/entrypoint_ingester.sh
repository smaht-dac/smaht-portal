#!/bin/sh

echo "Starting SMAHT Ingester"

# Run assume_identity.py to access the desired deployment configuration from
# secrets manager - this builds production.ini
poetry run python -m assume_identity

poetry run python -c "import encoded; print(encoded.__file__)"

# will serve forever
poetry run ingestion-listener production.ini --app-name app
