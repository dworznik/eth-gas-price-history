## Ethereum gas price historical data db

### Installation

```
cp .env.example .env
vim .env
npm install
npm run db-init
```

### Usage

```
npm run fetch
```

```
npm run server
```

```
curl http://localhost:3000/gas-price?from=2020-09-01&to=2020-09-04T12:00
```


