const DB = require("./db");
class DB_RSP extends DB{
    constructor(){
        super();
    }
    
    //Operações na coleção sessao
    updateQuestions(session){
        var filter = { _id: session._id };
        var newValues = { $set: { perguntas: session.perguntas} };
        return super.updateOne("sessao", filter, newValues);
    }
    
    gameInfo(session){ //Mantem informações gerais sobre o jogo
        return super.insert("sessao", session);
    } 

    async findSessions(session){
        // return this.conn.collection("sessions").findOne(session);
        return super.findOne("sessions", session);
    }

    //Operações na coleção usuário
    insertUsuario(usuario) {
        // return this.conn.collection("usuario").insertOne(usuario);
        return super.insert("usuario", usuario);
    }
 
    listUsuario(){
        return super.list("usuario", {});
    }

    // Operações com a coleção time
    updateTeam(time){
        var filter = { _id: time._id };
        var newValues = { $set: { members: time.members} };
        //return this.conn.collection("times").updateOne(filter, newValues);
        return super.updateOne("time", filter, newValues);
    }
    
    updateLastLeader(time){
        var filter = { _id: time._id };
        var newValues = { $set: { lastLeaders: time.lastLeaders} };
        // return this.conn.collection("times").updateOne(filter, newValues);
        return super.updateOne("time", filter, newValues);
    }

    updateEndCounter(time){
        var filter = { _id: time._id };
        var newValues = { $set: {endedGame: time.endedGame+1} };
        return super.updateOne("time",filter, newValues);
    }
    
    updateTeamScore(time){
        var filter = { _id: time._id };
        var newValues = { $set: { grpScore: time.grpScore} };
        return super.updateOne("time",filter, newValues);
    }

    updateIndScore(time, index) {
        var filter = { _id: time._id };
        var newValues = { $set: { [`members.${index}.indScore`]: time.indScore } };
        return super.updateOne("time",filter, newValues);
    }
    
    updateUserScore(user){
        var filter = { _id: user._id };
        var newValues = { $set: { indScore: user.indScore} };
        return super.updateOne("usuario",filter, newValues);
    }

    insertTeam(time){
        //return this.conn.collection("times").insertOne(time);
        return super.insert("time", time);
    }

    async findTeam(time){
        return super.list("time", time);
    }
    
    updateHelp(time){
        var filter = { _id: time._id };
        var newValues = { $set: { used5050: time.used5050 + 1 } };
        return super.updateOne("time",filter, newValues);
    }

    updateSkip(time){
        var filter = { _id: time._id };
        var newValues = { $set: { usedSkip: 1 } };
        return super.updateOne("time",filter, newValues);
    }

    updateLeader(time){
        var filter = { idTeam: time.idTeam };
        var newValues = { $set: { lider: time.lider} };
        return super.updateOne("time",filter, newValues);
    }

    listTeams(sessao){
         return super.list("time", sessao);
    }

    // Operações na coleção resposta
    updateAnswers(filter,newValues){
        return super.updateOne("resposta", filter, newValues);
    }
  
    updateOrdem(answers){
        var filter = { _id: answers._id };
        var newValues = { $set: { ordemQuestoes: answers.ordemQuestoes} };
        return super.updateOne("resposta", filter, newValues);
    }

    insertAnswers(answer){ 
        return super.insert("resposta", answer);
    } 
    
    updateCounter(counter){
        var incrementa = counter.answered +1;
        var filter = {  _id: counter._id };
        var newValues = { $set: { answered: incrementa} };
        return super.updateOne("resposta", filter, newValues);
    }
    
}
module.exports = DB_RSP;