const { handle } = require('express/lib/application');
const WebSocket = require('ws');

module.exports = (server, handler) => {

    const wss = new WebSocket.Server({
        server
    });

    wss.getUniqueID = function () {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4();
    };

    wss.on('connection', (ws, req) => {
        ws.id = wss.getUniqueID();

        ws.on('message', data => {
            console.log(`onMessage: ${data}`);
            const msg = JSON.parse(data);
            handler.handleMsg(wss, ws, msg);
            
            
        });

        ws.on("close", function () {
            handler.handleExit(wss, ws);
        });

        ws.on('error', error => {
            console.error(`onError: ${err.message}`);
        });

        console.log(`onConnection`);
    });

    console.log(`App Web Socket Server is running!`);
    return wss;
}
