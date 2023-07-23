const mongo = require("mongodb");
const mongoClient = mongo.MongoClient;

const HOST = process.env.MONGODB_HOST;
const USER = process.env.MONGODB_USER;
const PASS = process.env.MONGODB_PASS;
const DATABASE = process.env.MONGODB_DATABASE || "Responda_Se_Puder";

class DB {
    constructor() {
        this.mongoConnect(HOST, USER, PASS, DATABASE);
    }

    async mongoConnect(host, user, password, database) {
        var connected = this.conn != null;

        while (!connected) {

            console.log("host = " + host + ", user = " + user + ", password = " + password);
            console.log("Connecting to database " + database + " at " + (host != null ? host : "localhost") + "...");

            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log("=> Waiting for confirmation of MongoDB service startup");
            let client;
            if (HOST == null) {

                client = await mongoClient.connect("mongodb://127.0.0.1:27017", { useUnifiedTopology: true })
                    .then(conn => this.conn = conn.db(database))
                    .catch(err => console.log(err), connected = false)
            } else {
                client = await mongoClient.connect("mongodb://" + user + ":" + password + "@" + host + "/admin", { useUnifiedTopology: true })
                    .then(conn => this.conn = conn.db(database))
                    .catch(err => console.log(err), connected = false)
            }
            connected = !!client && !!client.topology && client.topology.isConnected()
        }
        console.log("MongoDB successfully started.");
    }

    async findOne(collectionName, query, proj) {
        var result = null;
        var ok = false;
    
        while (!ok) {
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log("=> Waiting for result");
            
            await this.conn.collection(collectionName).findOne(query, {projection: proj}) 
                    .then(res => { result = res; ok = true })
                    .catch(err => console.log(err))
            
        }
    
        return result;
    }
    
    async find(collectionName, query, projection) {
        var result = [];
        var ok = false;

        while (!ok) {
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log("=> Waiting for result");
            
            await this.conn.collection(collectionName).find(query).project(projection).toArray() 
                    .then(res => { result = res; ok = true;})
                    .catch(err => console.log(err))
            
        }
    
        return result;
    }

    insertUsuario(usuario) {
        return this.conn.collection("usuario").insertOne(usuario);
    }

    UpdateTeam(time){
        var filter = { _id: time._id };
        var newvalues = { $set: { members: time.members} };
        return this.conn.collection("times").updateOne(filter, newvalues);
    }

    UpdateLeader(time){
        var filter = { idTeam: time.idTeam };
        var newvalues = { $set: { lider: time.lider} };
        return this.conn.collection("times").updateOne(filter, newvalues);
    }

    UpdateAnswers(filter,newvalues){
        return this.conn.collection("answers").updateOne(filter, newvalues);
    }

    UpdateQuestions(session){
        var filter = { _id: session._id };
        var newvalues = { $set: { perguntas: session.perguntas} };
        return this.conn.collection("sessions").updateOne(filter, newvalues);
    }

    listUsuario(){
        return this.conn.collection("usuario").find({}).toArray();
    }
    
    listTeams(sessao){
        return this.conn.collection("times").find(sessao).toArray();
    }
    gameInfo(jogo){ //Mantem informações gerais sobre o jogo
        return this.conn.collection("sessions").insertOne(jogo);
    }
    
    insertAnswers(answers){ 
        return this.conn.collection("answers").insertOne(answers);
    } 

    countAnswers(answers){ 
        return this.conn.collection("countAnswers").insertOne(answers);
    } 
    
    UpdateCounter(counter){
        var incrementa = counter.answered +1;
        var filter = {  _id: counter._id };
        var newvalues = { $set: { answered: incrementa} };
        return this.conn.collection("answers").updateOne(filter, newvalues);
    }
   
    async findGameInfo(time){
        var retorno = await this.conn.collection("sessions").findOne(time).toArray();
        return retorno;
    }
    async updateOne(collection,filter,update){
        const retorno = await this.conn.collection(collection).updateOne(filter, update);
        return retorno;
    }

    findSessions(session){
        return this.conn.collection("sessions").findOne(session);
    }
     
    
    insertTeam(time){
        return this.conn.collection("times").insertOne(time);
    }
    
    // listTeam(Sid){
    //     return this.conn.collection("times").find({}, sessionId: Sid,{}).toArray();
    // }

    async findTeam(time){
        var retorno = await this.conn.collection("times").findOne(time).toArray();
        return retorno;
    }
}

module.exports = DB;