import cors from 'cors';
import { NextFunction, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import Cache from 'memcached-promisify';
import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import { verbose } from 'sqlite3';
import { open } from 'sqlite';

const sqlite3 = verbose();

const DB_PATH = process.env.DB_PATH;

const DATE_FMT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

Sentry.init({
  dsn: process.env.SERVER_SENTRY_URL!,
  tracesSampleRate: 1.0,
});

const app = express();
const port = process.env.SERVER_PORT;

const allowedOrigins = process.env.CORS_ORIGINS!.split(',');

const memcached = new Cache(
  { cacheHost: process.env.MEMCACHED_LOCATION! },
  {
    maxExpiration: parseInt(process.env.MEMCACHED_EXPIRATION!),
  },
);

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW!),
  max: parseInt(process.env.RATE_LIMIT!),
});

const asyncHandler = (fn: Function) => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

const pick = (ks: any[], obj: any) =>
  ks.reduce(function (acc, k) {
    acc[k] = obj[k];
    return acc;
  }, {});

const objMap = (obj: any, fn: Function) =>
  Object.keys(obj).reduce((acc: any, k) => {
    acc[k] = fn(obj[k]);
    return acc;
  }, {});

const trans = (x: { [k in string]: number }) => {
  try {
    const prices = objMap(
      pick(['fast', 'fastest', 'safeLow', 'average'], x),
      (x: number) => Math.round(x / 10),
    );
    const blockNum = x.blockNum;
    const date = x.date;
    return { date, blockNum, ...prices };
  } catch (err) {
    console.error(err);
  }
};

type Resolution = 'day' | 'hour' | '';

const buildSelect = (res: Resolution) => {
  switch (res) {
    case 'day':
      return "select date(timestamp) as date, avg(json_extract(data, '$.average')) as average, avg(json_extract(data, '$.fast')) as fast, avg(json_extract(data, '$.fastest')) as fastest, avg(json_extract(data, '$.safeLow')) as safeLow, min(json_extract(data, '$.blockNum')) as blockNum from gas_price";
    case 'hour':
      return "select strftime('%Y-%m-%dT%H', timestamp) || ':00Z' as date, avg(json_extract(data, '$.average')) as average, avg(json_extract(data, '$.fast')) as fast, avg(json_extract(data, '$.fastest')) as fastest, avg(json_extract(data, '$.safeLow')) as safeLow, min(json_extract(data, '$.blockNum')) as blockNum from gas_price";
    case '':
    case undefined:
      return "select strftime('%Y-%m-%dT%H:%M:%SZ', timestamp) as date, json_extract(data, '$.average') as average, json_extract(data, '$.fast') as fast, json_extract(data, '$.fastest') as fastest, json_extract(data, '$.safeLow') as safeLow, json_extract(data, '$.blockNum') as blockNum from gas_price";
    default:
      throw Error('Invalid res value');
  }
};

const buildWhere = (from: string, to: string, res: string) => {
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
  return (
    (where ? ' where ' + where : '') +
    (res === 'day' || res === 'hour' ? ' group by date' : '')
  );
};

const buildQuery = (from: string, to: string, res: Resolution) =>
  buildSelect(res) + buildWhere(from, to, res);

const cachedFn = (
  cache: Cache,
  fetchFn: Function,
  queryFn: Function,
  keyFn: Function,
) => async (...args: any[]) => {
  const k = keyFn(args);
  let val = await cache.get(k);
  if (val) return val;
  const query = queryFn(...args);
  val = await fetchFn(query);
  await cache.set(k, val, 600);
  return val;
};

(async function () {
  const db = await open(DB_PATH!, { mode: sqlite3.OPEN_READONLY });

  const fetchRows: (
    from?: string,
    to?: string,
    res?: Resolution,
  ) => Promise<any> = cachedFn(
    memcached,
    (q: string): Promise<any[]> => db.all(q),
    buildQuery,
    (x: any[]) => 'gas-price:' + x.join(''),
  );

  const corsConf = {
    methods: ['GET'],
    origin: function (origin: string, callback: Function) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          'The CORS policy for this site does not ' +
          'allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  };

  app.use(limiter);
  // @ts-ignore
  app.use(cors(corsConf));
  app.use(responseTime());
  // @ts-ignore
  app.options('*', cors(corsConf));

  app.get(
    '/gas-price',
    asyncHandler(async (req: Request, res: Response) => {
      const from = req.query.from as string;
      const to = req.query.to as string;
      const resolution = req.query.res as Resolution;

      const rows = await fetchRows(from, to, resolution);
      const data = rows.map(trans);
      res.json({ error: '', data });
    }),
  );

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    Sentry.captureException(err);
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
})();
