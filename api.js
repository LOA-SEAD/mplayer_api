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

    multicast(wss,obj,ids){
        console.log('Sending: ' + JSON.stringify(obj));
        console.log(ids);
        wss.clients.forEach(client=>{
            if (client.readyState === WebSocket.OPEN) {
                if (ids.includes(client.id))
                 client.send(JSON.stringify(obj));
            }
        });
    }
    
    unicast(wss,obj,id){
        console.log('Sending: ' + JSON.stringify(obj));
        console.log(ids);
        wss.clients.forEach(client=>{
            if (client.readyState === WebSocket.OPEN) {
                if (id==client.id)
                 client.send(JSON.stringify(obj));
            }
        });
    }

}
module.exports = API;