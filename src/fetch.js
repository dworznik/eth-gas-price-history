const axios = require('axios').default;
const Sentry = require("@sentry/node");
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { getData } = require('./lib/gas-station');

Sentry.init({
  dsn: process.env.FETCH_SENTRY_URL,
  tracesSampleRate: 1.0,
});

const INTERVAL = parseInt(process.env.INTERVAL) * 60 * 1000;
const DB_PATH = process.env.DB_PATH;

console.log('Interval: ' + INTERVAL);

const fetch = async (db) => {
  const data = await getData();
  console.log('Fetched gas station data');
  const stmt = await db.prepare("INSERT INTO gas_price (data) VALUES (?)");
  await stmt.run(JSON.stringify(data));
  await stmt.finalize();
}

const run = async () => {
  const db = await open(DB_PATH);
  try {
    await fetch(db);
  } catch (e) {
    Sentry.captureException(e);
    console.error('ERROR: ' + e.toString());
  }
  setTimeout(run, INTERVAL);
}

run().then();
