const axios = require('axios').default;
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const URL = 'https://ethgasstation.info/api/ethgasAPI.json';
const API_KEY = process.env.API_KEY;
const INTERVAL = parseInt(process.env.INTERVAL) * 60 * 1000;
const DB_PATH = process.env.DB_PATH;

console.log('Interval: ' + INTERVAL);

const fetch = async (db) => {
  const res = await axios.get(`${URL}?api-key=${API_KEY}`);
  const blockNum = res['blockNum'];
  console.log('Status: ' + res.status);
  if (res.status === 200) {
    const data = res.data;
    const stmt = await db.prepare("INSERT INTO gas_price (data) VALUES (?)");
    await stmt.run(JSON.stringify(data));
    await stmt.finalize();
  } else {
    console.error(res.status, res.statusText);
  }
  const data = res.data
}


const run = async () => {
  const db = await open(DB_PATH);
  try {
    await fetch(db);
  } catch (ex) {
    console.error('ERROR: ' + ex.toString());
  }
  setTimeout(run, INTERVAL);
}

run().then();
