//index.js
const { handle } = require('express/lib/router');
const app = require('./app');
const appWs = require('./app-ws');
const Handler = require('./handler');

const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`App Express is running!`);
})

appWs(server, new Handler());