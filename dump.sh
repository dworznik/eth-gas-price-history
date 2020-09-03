#!/usr/bin/env sh

sqlite3 $DB_PATH <<EOL
.headers on
.mode list
select * from gas_price;
EOL
