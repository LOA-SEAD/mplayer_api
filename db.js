const mongo = require("mongodb");
const mongoClient = mongo.MongoClient;

const HOST = process.env.MONGO_INITDB_HOST;
const USER = process.env.MONGO_INITDB_ROOT_USERNAME;
const PASS = process.env.MONGO_INITDB_ROOT_PASSWORD;
const DATABASE = process.env.MONGO_INITDB_DATABASE || "Responda_Se_Puder";

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
            // console.log("=> Waiting for result");
            
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
            // console.log("=> Waiting for result");
            
            await this.conn.collection(collectionName).find(query).project(projection).toArray() 
                    .then(res => { result = res; ok = true;})
                    .catch(err => console.log(err))
            
        }
    
        return result;
    }

    async getNextSequenceValue(sequenceName){
        
        var ret = await this.findOne('counters', {_id: sequenceName}, {sequence_value: 1});
        var value = 1;
        // console.log(ret);

        if (ret == null) {
            this.conn.collection('counters').insertOne({_id: sequenceName, sequence_value: value});
        } else {
            value = ret.sequence_value + 1;
            const filter = {_id: sequenceName };
            const newValue = {$set: {sequence_value: value} };
            this.conn.collection("counters").updateOne(filter, newValue);
        }
        return value;
     }
    async updateOne(collection,filter,update){
        const retorno = await this.conn.collection(collection).updateOne(filter, update);
        return retorno;
    }
    insert(collectionName, object) {
        return this.conn.collection(collectionName).insertOne(object);
    }
    
    list(collectionName, filter) {
        return this.conn.collection(collectionName).find(filter).toArray();
    }

}

module.exports = DB;