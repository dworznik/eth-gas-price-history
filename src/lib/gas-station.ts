import axios from 'axios';
import { pipe, prop, andThen } from 'ramda';

const URL = 'https://ethgasstation.info/api/ethgasAPI.json';
const API_KEY = process.env.API_KEY;

export const getData = pipe(
  () => axios.get(`${URL}?api-key=${API_KEY}`),
  andThen(prop('data')),
);
