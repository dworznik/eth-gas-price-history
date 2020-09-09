const axios = require('axios').default;
const { pipe, prop, andThen } = require('ramda');

const URL = 'https://ethgasstation.info/api/ethgasAPI.json';
const API_KEY = process.env.API_KEY;

const getData = pipe(() => axios.get(`${URL}?api-key=${API_KEY}`), andThen(prop('data')));

module.exports = {
  getData
}
