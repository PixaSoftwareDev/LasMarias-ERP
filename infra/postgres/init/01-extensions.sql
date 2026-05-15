-- Extensiones útiles para el sistema de gestión láctea.
-- Se ejecuta automáticamente al crear el contenedor por primera vez.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- búsquedas por similitud (autocompletado de clientes, productos)
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- búsqueda sin acentos
