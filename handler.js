
const WebSocket = require('ws');
const API = require('./api');
const DB = require('./db');

class Handler extends API {
    constructor() {
        super();
        this.connections_id = [];
        this.players = [];
        this.idAndpasswords = [];
        this.teams = [];
        this.db = new DB();
        this.totalAnswers =[0];
    }

    //ENTRAR_SESSAO   ENTER_SESSION
    handleMsg(wss, ws, msg) {
        if (msg.messageType == 'ENTRAR_SESSAO')
            this.handleEnterTeam(wss, ws, msg);
        else if (msg.messageType == 'CADASTRAR_SESSAO')
            this.handleCadastra(wss, ws, msg);
        else if (msg.messageType == 'COMECAR_JOGO')
            this.handleStart(wss, ws, msg);
        else if(msg.messageType == 'RESPOSTA_INDIVIDUAL')
            this.handleIndividualMoment(wss,ws,msg); 
        else if (msg.messageType == 'EXIT')
            this.handleExit(wss, ws, msg);
    }

    handleCadastra(wss, ws, msg) {
        this.db.gameInfo({
            gameId:msg.gameId,
            nrTeams: msg.nrTeams,
            nrPlayers: msg.nrPlayers,
            nrHelp5050: msg.nrHelp5050,
            timeQuestion: msg.timeQuestion,
            totalQuestion:msg.totalQuestion,
            questionRaffle:msg.questionRaffle,
            moderator: msg.moderator,
            sessionId:23,
            perguntas: [] //atualizar depois do sorteio das perguntas
        });
        

        for (var i = 0; i < msg.nrTeams; i++) {
            var team = new Map();
            team.set('id', i);
            team.set('lider', -1);
            var password = Math.floor((1 + Math.random()) * 0x100000000).toString(16).substring(1);
            team.set('password', password);
            team.set('members', []);
            this.teams.push(team);
            this.idAndpasswords.push({ "id": team.get('id'), "secret": team.get('password') });
            this.db.insertTeam({
                idTeam: team.get('id'),
                secret: team.get('password'),
                sessionId: 23,
                lider: 0, //atualizar no sorteio
                members: []
            });
        }
        //criar session id
        //Armazenar informacoes no banco de dados



        var mensagem = {
            "messageType": 'SESSAO_CRIADA',
            //"gameId": msg.gameId,
            "teams": this.idAndpasswords,
            "sessionId": 23,
        };

        super.broadcast(wss, mensagem);
    }


    //
    handleEnterTeam(wss, ws, msg) {
        var pos = msg.secret.indexOf('@');
        var sessionId = msg.secret.substring(0, pos);
        var secret = msg.secret.substring(pos + 1);
        var userId = Math.floor(Math.random() * 20); //criação do Id do usuario
        
        const findIdsAndPasswords = async () => {
            console.log("sessionId = " + sessionId);
            console.log("senha = " + secret);
            
            this.idAndpasswords = await this.db.find("times",{},{secret: 1, _id : 0});
            console.log(this.idAndpasswords);
            var index = this.idAndpasswords.findIndex((elemento) => elemento.secret === secret);
            if (index != -1) {
                let user = {
                    "id": userId,
                    "name": msg.user
                };
                this.db.insertUsuario({
                    id:   userId,
                    name: msg.user
                });
                var team = await this.db.findOne("times", { secret: secret }, {});
                console.log(team);
    
                team.members.push({ id: userId, name:msg.user, ws_id: ws.id });
                var members2 = team.members.map(item => item.ws_id);
                console.log(members2);
                this.db.UpdateTeam(team);

                /* var members = this.teams[index].get('members');
                members.push(user); */
                console.log(team);

                var mensagem = {
                    "messageType": "ENTROU_SESSAO",
                    "user": user,
                    "teamId": this.idAndpasswords[index].id,
                    "sessionId": sessionId,
                    "gameId": 0 // buscar do banco de dados (recuperar gameId => sessionId) ?
                }
                super.multicast(wss,mensagem,members2);
            }
            else {
                var mensagem = {
                    "messageType": "ACESSO_INVALIDO",
                    "reason": "WRONG_PASSWORD"
                }
            }
            //super.broadcast(wss, mensagem);
        };

        findIdsAndPasswords(msg);
    }

    handleStart(wss, ws, msg) {
        var numero;
        var fase = [];
        var i,j;
        

        const findSession = async() => {

        var session = await this.db.findOne("sessions", { sessionId: msg.sessionId }, {});
        var numberTeams =  await this.db.findOne("sessions", { sessionId: msg.sessionId, }, {});
        for (i = 0; i < 3; i++) {
            var S = new Set(); //nao deixa adicionar elementos iguais
            while (S.size < session.questionRaffle[i]) {
                numero = Math.floor(Math.random() * session.totalQuestion[i] + 1);
                S.add(numero);
                //Cria um registro para cada pergunta
            for(j=0;j<session.nrTeams;j++){
            //contador de membros do time que responderam
              this.db.insertAnswers({
                sessionId: msg.sessionId,
                fase: i,
                question: numero,
                idTeam: j,
                answered: 0,
                r:0,
                r1:0,
                r2:0,
                r3:0
              })
            }
        }

            fase[i] = Array.from(S);
        }

        session.perguntas = fase;
        await this.db.UpdateQuestions(session); //Atualização do campo perguntas
        

        var team = await this.db.listTeams({sessionId: msg.sessionId});
        console.log(team);
        var membersWsIds;


        team[1].lider = 1;
        var a = await team[1].members[0].id; 

        await this.db.UpdateTeam(team[1]); //Atualização do campo perguntas
        await this.db.UpdateLeader(team[1]);
    //     for(i=0; i<session.nrTeams; i++){
    //       team[i].lider = team[i].members[Math.floor(Math.random() * team[i].members.length)].id;
    //       await this.db.UpdateLeader(team[1]);
    //       membersWsIds[i] = team[i].members.map(item => item.ws_id);
    //   }
    
        // for(i=0;i<session.nrTeams;i++){
        //    await this.db.UpdateLeader(team[i]);
        //   var mensagem = {
        //  "messageType":"INICIA_JOGO",
        //     "totalQuestion":session.totalQuestion,
        //     "question": {
        //         "easy":fase[1],
        //         "medium":fase[2],
        //         "hard":fase[3]
        //     },
        //     "team": team[i].members,
        //     "timeQuestion":session.timeQuestion,
        //     "leaderId": team[i].lider,
        //     "sessionId":session.sessionId,
        //     "gameId":0
        //     }
        //     super.multicast(wss,mensagem,membersWsIds[i]);
        // }

        var mensagem = {
            "messageType":"INICIA_JOGO",
            "totalQuestion":session.totalQuestion,
            "question": {
                "easy":fase[0],
                "medium":fase[1],
                "hard":fase[2]
            },
            "team": team[1].members.name,
            "timeQuestion":session.timeQuestion,
            "leaderId": team[1].lider,
            "sessionId":session.sessionId,
            "gameId":0
        }
        super.broadcast(wss, mensagem);
    }
       findSession();
      }

    
     
     handleIndividualMoment(wss,ws,msg){

        const answer = async()=>{
         
        var answers = await this.db.findOne("answers", {sessionId: msg.sessionId, question: msg.question, fase:msg.fase,idTeam: msg.teamId}, { });
        var team =  await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, { });
       // var counter =  await this.db.findOne("countAnswers", { sessionId: msg.sessionId, idTeam: msg.teamId, question:msg.question, fase:msg.fase }, { });
        // this.totalAnswers[msg.teamId]++; //Variavel que controla quantas pessoas de cada grupo ja respondeu
         //console.log(this.totalAnswers[msg.teamId]);

        const resposta = msg.answer; 
        var filter = { _id: answers._id };
        var newvalues;

     

        if(resposta === "r")
          newvalues = { $set: { r: answers.r +1} };
        else if(resposta === "r1")
           newvalues = { $set: { r1: answers.r1+1} };
        else if(resposta === "r2")
           newvalues = { $set: { r2: answers.r2+1} };
        else if(resposta === "r3")
           newvalues = { $set: { r3: answers.r3+1} };
        
        await this.db.UpdateAnswers(filter,newvalues);
        await this.db.UpdateCounter(answers);
        var checkCount = await this.db.findOne("answers", {sessionId: msg.sessionId, question: msg.question, fase:msg.fase,idTeam: msg.teamId}, { });
        console.log(checkCount.answered);
        //Quando todos os membros de um time responderem
        console.log(team.members.lenght);
        if(checkCount.answered == team.members.length){
        var membersWs = team.members.map(item => item.ws_id);
           var mensagem ={
           
            "message_type" :"MOMENTO_GRUPO",
            "teamId": msg.teamId,
            "teamId": team.idTeam,
            "sessionId": msg.sessionId,
            "gameId":msg.gameId,
            "answer":{
                "r": answers.r, 
                "r2":answers.r1,
                "r3":answers.r2,
                "r4":answers.r3
            }

        }
        //manda a mensagem para todos os membros do time
        super.multicast(wss,mensagem,membersWs);
    }
     else
       return "Waiting Other members";
        
     }
        answer();
    }

}
    


module.exports = Handler;
