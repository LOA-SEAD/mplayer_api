 
const WebSocket = require('ws');
const API = require('./api');
const db = require('./db');


class Handler extends API {
    constructor() {
        super();
        this.connections_id = [];
        this.players = [];
        this.idAndpasswords = [];
        this.teams = [];
    }

    //ENTRAR_SESSAO   ENTER_SESSION
    handleMsg(wss, ws, msg) {
        if (msg.messageType == 'ENTRAR_SESSAO')
            this.handleEnterTeam(wss, ws, msg);
        else if (msg.messageType == 'CADASTRAR_SESSAO')
            this.handleCadastra(wss, ws, msg);
        else if(msg.messageType == 'COMECAR_JOGO')
            this.handleStart(wss,ws,msg);
        //else if(msg.messageType == 'SORTEIO_LIDER')
        //this.handleSorteiaLider(wss,ws,msg); 
    }

    handleCadastra(wss, ws, msg) {
        
        for (var i = 1; i <= msg.nrTeams; i++) {
            var team = new Map();
            team.set('id', i);
            team.set('lider', -1);
            var password = Math.floor((1 + Math.random()) * 0x100000000).toString(16).substring(1);
            team.set('password', password);
            team.set('members', []);
            this.teams.push(team);
            this.idAndpasswords.push({ "id": team.get('id'), "secret": team.get('password') });
            db.insertTeam({
                idTeam: team.get('id'),
                secret: team.get('password'),
                lider: -1 //atualizar no sorteio
            });
        }

        //Armazenar informacoes no banco de dados
           db.gameInfo({
               nrTeams: msg.nrTeams,
               nrPlayers: msg.nrPlayers,
               nrHelp5050: msg.nrHelp5050,
               timeQuestion: msg.timeQuestion,
               moderator: msg.moderator,
               perguntas:[-1 -1 -1] //atualizar depois do sorteio das perguntas
           });

            
        var mensagem = {
            "messageType": 'SESSAO_CRIADA',
            //"gameId": msg.gameId,
            "teams": this.idAndpasswords,
            "sessionId": 23,
        };

        super.broadcast(wss,mensagem);
    }
   

    //
    handleEnterTeam(wss, ws, msg) {
        var pos = msg.secret.indexOf('@');
        var sessionId = msg.secret.substring(0, pos);
        var secret = msg.secret.substring(pos + 1);
        var userId = Math.floor(Math.random() * 20); //criação do Id do usuario
        console.log ("sessionId = " + sessionId);
        console.log ("senha = " + secret);

        var index = this.idAndpasswords.findIndex((elemento) => elemento.secret === secret);
        if (index != -1) {
            let user = {
                "id" : userId, 
                "name": msg.user.nome
            };
            var team = db.findTeam({secret:msg.password});
            var idTeam = team.idTeam;
            db.insertUsuario({
                id: userId,
                name: msg.user.nome,
                team: idTeam
            }); 
            var members = this.teams[index].get('members');
            members.push(user);
            console.log(members);

            var mensagem = {
                "messageType" : "ENTROU_SESSAO",
                "user": user,
                "teamId": this.idAndpasswords[index].id,
                "sessionId": sessionId,
                "gameId" : 0 // buscar do banco de dados (recuperar gameId => sessionId) ?
            }
        }
        else {
            var mensagem = {
              "messageType":"ACESSO_INVALIDO",
              "reason":"WRONG_PASSWORD"
            }
        }
             super.broadcast(wss,mensagem);
    }
    
    handleStart(wss,ws,msg){
        console.log(msg);
        var numero;
        var fase = [];
        var i;
        for(i=0;i<3;i++){
            var S = new Set(); //nao deixa adicionar elementos iguais
         while (S.size < msg.nrSorteadas[i]){
            numero = Math.floor(Math.random() * msg.nroTotal[i]+1);
               S.add(numero);//guardar bd
         }
               fase[i]=Array.from(S);
      }
        var mensagem = {
            "Perguntas":fase
        }
        super.broadcast(wss,mensagem);
    }
    //////////////////////////////////////////////////////////////////////////////////
    // handleLider(wss,ws,msg){
    //   for(i=0;i<msg.nroEquipes;i++){
    //     this.teams[i].lider = sorteiaLider(msg.teams[i]);
    //   }

    //     var mensagem = {
    //         "idJogador": msg.idJogador,
    //         "idCodigoEquipe": ,
    //         "idLider":
    //     }
    // }
    //////////////////////////////////////////////////////////////////////////////////

    handleExit(wss, ws) {

    }
}

module.exports = Handler;
// function sorteiaLider(teams[i]){
//     var lider = teams[i].members[Math.floor(Math.random() * members.length)];
//     return lider;
// }