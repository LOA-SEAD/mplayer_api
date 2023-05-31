const WebSocket = require('ws');

class API {
    constructor(){
    }

    broadcast(wss, obj) {
        console.log('Sending: ' + JSON.stringify(obj));
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(obj));
            }
        });
    }    
}
module.exports = API;