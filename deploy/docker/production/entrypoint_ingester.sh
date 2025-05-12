#!/bin/sh

echo "Starting SMAHT Ingester"

# Run assume_identity.py to access the desired deployment configuration from
# secrets manager - this builds production.ini
poetry run python -m assume_identity
echo "🔍 DEBUG: Beginning container startup diagnostics..."

# Print Python version and path
echo "🐍 Python Version:"
python --version

echo "📍 Python Executable:"
which python

# Print virtual environment location
echo "🧪 VIRTUAL_ENV:"
echo "$VIRTUAL_ENV"

# Print sys.path using inline Python
echo "📚 Python sys.path:"
python -c 'import sys; print("\n".join(sys.path))'

# Print installed packages
echo "📦 Installed Python Packages:"
python -m pip list

# Check for existence and path of ingestion-listener
echo "🧭 Checking for ingestion-listener script:"
which ingestion-listener || echo "⚠️ ingestion-listener not found in PATH"

# Check encoded module
echo "🔍 Attempting to import encoded module..."
python -c 'import encoded; print(f"✅ encoded loaded from: {encoded.__file__}")' || echo "❌ Could not import 'encoded' module"

echo "✅ Startup diagnostics complete."

# will serve forever
poetry run ingestion-listener production.ini --app-name app
