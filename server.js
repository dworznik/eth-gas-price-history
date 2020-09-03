const express = require('express')
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const DB_PATH = process.env.DB_PATH;

const DATE_FMT = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;
const app = express()
const port = process.env.SERVER_PORT;

const asyncHandler = fn => (req, res, next) => {
  return Promise
    .resolve(fn(req, res, next))
    .catch(next);
};

const pick = (ks, obj) => ks.reduce(function (acc, k) {
  acc[k] = obj[k];
  return acc;
}, {});

const objMap = (obj, fn) => Object.keys(obj).reduce((acc, k) => {
  acc[k] = fn(obj[k]);
  return acc;
}, {});

const trans = x => {
  try {
    const json = JSON.parse(x.data);
    const prices = objMap(pick(['fast', 'fastest', 'safeLow', 'average'], json), x => x / 10);
    const blockNum = json['blockNum'];
    const timestamp = x.timestamp
    return { timestamp, blockNum, ...prices };
  } catch (err) {
    console.error(err);
    return;
  }
}

(async function () {
  const db = await open(DB_PATH, { mode: sqlite3.OPEN_READONLY });

  app.get('/gas-price', asyncHandler(async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    let where = '';
    if (from && DATE_FMT.test(from)) {
      where += ` AND timestamp >= '${from}'`;
    }
    if (to && DATE_FMT.test(to)) {
      where += ` AND timestamp <= '${to}'`;
    }
    console.log('Query: ' + where);
    const rows = await db.all(`SELECT * FROM gas_price WHERE true ${where}`);
    const data = rows.map(trans);
    res.json({ error: '', data });
  }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message })
  })

  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  })
})();

