#!/usr/bin/env sh

error_exit()
{
  echo "$1" 1>&2
  exit 1
}

which sqlite3
if [ $? -ne 0 ]; then
  exit 1
fi

cd $(dirname $DB_PATH) || error_exit "Cannot change directory $DB_PATH"

name_db='gas.db'

sqlite3 $name_db <<'EOL'
  CREATE TABLE gas_price (timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, data TEXT);
  CREATE UNIQUE INDEX idx_gas_price_timestamp ON gas_price (timestamp);
EOL
