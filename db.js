const mongo = require("mongodb");
const mongoClient = mongo.MongoClient;
//const{MongoClient}= require("mongodb");
const HOST = process.env.MONGODB_HOST;
const USER = process.env.MONGODB_USER;
const PASS = process.env.MONGODB_PASS;

// async function mongoConnect(host, user, password){
//     const client= new MongoClient("mongodb://127.0.0.1:27017/");
//     await client.connect();
//     console.log("entrou");
//     client.db("Responda_Se_Puder");
//     console.log("entrou2");
// }

function gameInfo(jogo){ //Mantem informações gerais sobre o jogo
    return global.conn.collection("jogo").insertOne(jogo);
}

function insertTeam(time){
    return global.conn.collection("times").insertOne(time);
}

function findTeam(time){
    return global.conn.collection("times").findOne(time);
}

function insertUsuario(usuario){
    return global.conn.collection("usuario").insertOne(usuario);
}

function listUsuario(){
    return global.conn.collection("usuario").find({}).toArray();
}

async function mongoConnect(host, user, password) {
    var connected = false;
    console.log("Connecting to mongodb at " + (host != null ? host: "localhost") + "...");
    while (!connected) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log("=> Waiting for confirmation of MongoDB service startup");
        let client;
        if (HOST == null) {

            client = await mongoClient.connect("mongodb://127.0.0.1:27017/", { useUnifiedTopology: true })
                .then(conn => global.conn = conn.db("Responda_Se_Puder"))
                .catch(err => console.log(err), connected = false)
               // console.log("ok");
                // insertTeam({
                //     idTeam: 12414,
                //     secret: 123
                // });
                // user = await listUsuario();
                // console.log(user);
                //  const val = {secret:123};
                //  const teste = await findTeam(val);
                //  const teste2= teste.idTeam;
                //  console.log("ok:",teste2);
                 var user = await listUsuario();
                 console.log(user);
        } else {
            client = await mongoClient.connect("mongodb://" + user + ":" + password + "@" + host + "/admin", { useUnifiedTopology: true })
                .then(conn => global.conn = conn.db("Responda_Se_Puder"))
                .catch(err => console.log(err), connected = false)
        }
        connected = !!client && !!client.topology && client.topology.isConnected()
    }
    console.log("MongoDB successfully started.");
}

mongoConnect(HOST, USER, PASS);




module.exports = {insertTeam, listUsuario, insertUsuario, gameInfo, findTeam};