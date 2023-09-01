const WebSocket = require('ws');

class Handler {
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

    multicast(wss, ids, msg){
        console.log('Sending: ' + JSON.stringify(msg));
        var list = Array.from(ids);

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                if (list.includes(client.id))
                 client.send(JSON.stringify(msg));
            }
        });
    }
    
    unicast(wss, id, msg){
        console.log('Sending: ' + JSON.stringify(msg));
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                if (id == client.id)
                 client.send(JSON.stringify(msg));
            }
        });
    }
}
module.exports = Handler;