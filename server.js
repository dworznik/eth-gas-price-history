const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const Memcached = require('memcached-promise');
const responseTime = require('response-time');
const Sentry = require("@sentry/node");
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const DB_PATH = process.env.DB_PATH;

const DATE_FMT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

Sentry.init({
  dsn: process.env.SERVER_SENTRY_URL,
  tracesSampleRate: 1.0,
});

const app = express()
const port = process.env.SERVER_PORT;

const memcached = new Memcached(process.env.MEMCACHED_LOCATION,
  { maxExpiration: parseInt(process.env.MEMCACHED_EXPIRATION) });

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW),
  max: parseInt(process.env.RATE_LIMIT)
});

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
    const prices = objMap(pick(['fast', 'fastest', 'safeLow', 'average'], x), x => Math.round(x / 10));
    const blockNum = x.blockNum;
    const date = x.date
    return { date, blockNum, ...prices };
  } catch (err) {
    console.error(err);
    return;
  }
}

const buildSelect = res => {
  switch (res) {
    case 'day':
      return 'select date(timestamp) as date, avg(json_extract(data, \'$.average\')) as average, avg(json_extract(data, \'$.fast\')) as fast, avg(json_extract(data, \'$.fastest\')) as fastest, avg(json_extract(data, \'$.safeLow\')) as safeLow, min(json_extract(data, \'$.blockNum\')) as blockNum from gas_price';
    case 'hour':
      return 'select strftime(\'%Y-%m-%dT%H\', timestamp) || \':00Z\' as date, avg(json_extract(data, \'$.average\')) as average, avg(json_extract(data, \'$.fast\')) as fast, avg(json_extract(data, \'$.fastest\')) as fastest, avg(json_extract(data, \'$.safeLow\')) as safeLow, min(json_extract(data, \'$.blockNum\')) as blockNum from gas_price';
    case '':
    case undefined:
      return 'select strftime(\'%Y-%m-%dT%H:%M:%SZ\', timestamp) as date, json_extract(data, \'$.average\') as average, json_extract(data, \'$.fast\') as fast, json_extract(data, \'$.fastest\') as fastest, json_extract(data, \'$.safeLow\') as safeLow, json_extract(data, \'$.blockNum\') as blockNum from gas_price';
    default:
      throw Error('Invalid res value');
  }
}

const buildWhere = (from, to, res) => {
  let where;

  if (from) {
    if (!DATE_FMT.test(from)) {
      throw Error('Invalid from value');
    }
    where = (where ? where : '') + ` timestamp >= datetime('${from}')`;
  }
  if (to) {
    if (!DATE_FMT.test(to)) {
      throw Error('Invalid to value');
    }
    where = (where ? where + ' and ' : '') + ` timestamp <= datetime('${to}')`;
  }
  return (where ? ' where ' + where : '') + (res === 'day' || res === 'hour' ? ' group by date' : '');
}

const buildQuery = (from, to, res) => buildSelect(res) + buildWhere(from, to, res);

const cachedFn = (cache, fetchFn, queryFn, keyFn) => async (...args) => {
  const k = keyFn(args);
  let val = await cache.get(k);
  if (val) return val;
  const query = queryFn(...args);
  val = await fetchFn(query);
  await cache.set(k, val);
  return val;
}


(async function () {
  const db = await open(DB_PATH, { mode: sqlite3.OPEN_READONLY });

  const fetchRows = cachedFn(memcached, q => db.all(q), buildQuery, x => x.join(''));

  app.use(limiter);
  app.use(cors());
  app.use(responseTime());
  app.options('*', cors());

  app.get('/gas-price', asyncHandler(async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    const resolution = req.query.res;

    const rows = await fetchRows(from, to, resolution);
    const data = rows.map(trans);
    res.json({ error: '', data });
  }));

  app.use((err, req, res, next) => {
    Sentry.captureException(err);
    console.error(err);
    res.status(500).json({ error: err.message })
  })

  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  })
})();

