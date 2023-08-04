
const WebSocket = require('ws');
const API = require('./api');
const DB = require('./db');

class Handler extends API {
    constructor() {
        super();
        this.connections_id = [];
        this.players = [];
        this.teams = [];
        this.db = new DB();
        this.totalAnswers = [0];
    }


    handleMsg(wss, ws, msg) {
        if (msg.messageType == 'ENTRAR_SESSAO')
            this.handleEnterTeam(wss, ws, msg);
        else if (msg.messageType == 'CADASTRAR_SESSAO')
            this.handleCadastra(wss, ws, msg);
        else if (msg.messageType == 'COMECAR_JOGO')
            this.handleStart(wss, ws, msg);
        else if (msg.messageType == 'RESPOSTA_INDIVIDUAL')
            this.handleIndividualMoment(wss, ws, msg);
        else if (msg.messageType == 'PEDIR_AJUDA')
            this.handleAskForHelp(wss, ws, msg);
        else if (msg.messageType == 'RESPOSTA_FINAL')
            this.handleFinalAnswer(wss, ws, msg);
        else if (msg.messageType == 'PROXIMA_QUESTAO')
            this.handleNextQuestion(wss, ws, msg);
        else if (msg.messageType == 'PROXIMA_FASE')
            this.handleNextFase(wss, ws, msg);
    }

    handleCadastra(wss, ws, msg) {

        const cadastra = async () => {

            var userId = await this.db.getNextSequenceValue('usuarios');

            console.log("userId = " + userId);

            let moderator = { "id": userId, "name": msg.moderator.name };

            this.db.insertUsuario(moderator);

            var sessionId = await this.db.getNextSequenceValue('sessoes');

            console.log("sessionId = " + sessionId);

            this.db.gameInfo({
                gameId: msg.gameId,
                nrTeams: msg.nrTeams,
                nrPlayers: msg.nrPlayers,
                nrHelp5050: msg.nrHelp5050,
                timeQuestion: msg.timeQuestion,
                totalQuestion: msg.totalQuestion,
                questionRaffle: msg.questionRaffle,
                moderator: moderator,
                sessionId: sessionId,
                perguntas: [] //atualizar depois do sorteio das perguntas
            });

            var idAndpasswords = [];

            for (var i = 1; i <= msg.nrTeams; i++) {
                var team = new Map();
                team.set('id', i);
                team.set('lider', -1);
                var password = Math.floor((1 + Math.random()) * 0x100000000).toString(16).substring(1);
                team.set('password', password);
                team.set('members', []);
                this.teams.push(team);
                idAndpasswords.push({ "id": team.get('id'), "secret": team.get('password') });
                this.db.insertTeam({
                    idTeam: team.get('id'),
                    secret: team.get('password'),
                    sessionId: sessionId,
                    lider: 0, //atualizar no sorteio
                    used5050: 0,
                    lastLeaders: [],
                    members: [{ id: userId, name: msg.moderator.name, ws_id: ws.id }],
                    maxSize: msg.nrPlayers + 1
                });
            }

            var mensagem = {
                "messageType": 'SESSAO_CRIADA',
                //"gameId": msg.gameId,
                "teams": idAndpasswords,
                "sessionId": sessionId,
            };

            super.unicast(wss, ws.id, mensagem);
        }

        cadastra();
    }

    handleEnterTeam(wss, ws, msg) {
        var pos = msg.secret.indexOf('@');
        var sessionId = parseInt(msg.secret.substring(0, pos));
        var secret = msg.secret.substring(pos + 1);

        const findIdsAndPasswords = async () => {

            console.log("sessionId = " + sessionId);
            console.log("senha = " + secret);

            var userId = await this.db.getNextSequenceValue('usuarios');

            var idAndpasswords = await this.db.find("times",
                { sessionId: sessionId },
                { secret: 1, _id: 0 });
            console.log(idAndpasswords);
            var index = idAndpasswords.findIndex((elemento) => elemento.secret === secret);
            
            if (index != -1) {
                var team = await this.db.findOne("times", { secret: secret }, {});
                console.log(team);

                if (team.members.length < team.maxSize) {

                    let user = {
                        "id": userId,
                        "name": msg.user.name
                    };
                    this.db.insertUsuario(user);

                    team.members.push({ id: userId, name: msg.user.name, ws_id: ws.id });
                    var members2 = team.members.map(item => item.ws_id);
                    console.log(members2);
                    this.db.UpdateTeam(team);

                    console.log(team);

                    var session = await this.db.findOne("sessions", { sessionId: sessionId }, {});

                    var mensagem = {
                        "messageType": "ENTROU_SESSAO",
                        "user": { "id": user.id, "name": user.name },
                        "teamId": team.idTeam,
                        "sessionId": sessionId,
                        "gameId": session.gameId
                    }
                    
                    super.multicast(wss, members2, mensagem);

                } else {
                    var mensagem = {
                        "messageType": "ACESSO_INVALIDO",
                        "reason": "EXCEEDED_MAXIMUM_NUMBER_PARTICIPANTS"
                    }
    
                    super.unicast(wss, ws.id, mensagem);    
                }
            }
            else {
                var mensagem = {
                    "messageType": "ACESSO_INVALIDO",
                    "reason": "WRONG_PASSWORD"
                }

                super.unicast(wss, ws.id, mensagem);
            }
        };

        findIdsAndPasswords(msg);
    }

    handleStart(wss, ws, msg) {
        var numero;
        var fase = [];
        var i, j;


        const findSession = async () => {

            var session = await this.db.findOne("sessions", { sessionId: msg.sessionId }, {});
            var numberTeams = await this.db.findOne("sessions", { sessionId: msg.sessionId, }, {});
            for (i = 0; i < 3; i++) {
                var S = new Set(); //nao deixa adicionar elementos iguais
                while (S.size < session.questionRaffle[i]) {
                    numero = Math.floor(Math.random() * session.totalQuestion[i] + 1);
                    S.add(numero);
                    //Cria um registro para cada pergunta
                    for (j = 0; j < session.nrTeams; j++) {
                        //contador de membros do time que responderam
                        this.db.insertAnswers({
                            sessionId: msg.sessionId,
                            fase: i,
                            question: numero,
                            idTeam: j,
                            answered: 0,
                            r: 0,
                            r1: 0,
                            r2: 0,
                            r3: 0
                        })
                    }
                }

                fase[i] = Array.from(S);
            }

            session.perguntas = fase;
            await this.db.UpdateQuestions(session); //Atualização do campo perguntas


            var team = await this.db.listTeams({ sessionId: msg.sessionId });
            var membersWsIds = [session.nrTeams];


            for (i = 0; i < session.nrTeams; i++) {
                team[i].lider = team[i].members[Math.floor(Math.random() * team[i].members.length)].id;
                await this.db.UpdateLeader(team[i]);
                membersWsIds[i] = team[i].members.map(item => item.ws_id);
            }

            for (i = 0; i < session.nrTeams; i++) {
                await this.db.UpdateLeader(team[i]);
                var mensagem = {
                    "messageType": "INICIA_JOGO",
                    "totalQuestion": session.totalQuestion,
                    "question": {
                        "easy": fase[1],
                        "medium": fase[2],
                        "hard": fase[3]
                    },
                    "team": team[i].members,
                    "timeQuestion": session.timeQuestion,
                    "leaderId": team[i].lider,
                    "sessionId": session.sessionId,
                    "gameId": 0
                }
                super.multicast(wss, membersWsIds[i], mensagem);
            }


        }
        findSession();
    }



    handleIndividualMoment(wss, ws, msg) {

        const answer = async () => {

            var answers = await this.db.findOne("answers", { sessionId: msg.sessionId, question: msg.question, fase: msg.fase, idTeam: msg.teamId }, {});
            var team = await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});


            const resposta = msg.answer;
            var filter = { _id: answers._id };
            var newvalues;

            if (resposta === "r")
                newvalues = { $set: { r: answers.r + 1 } };
            else if (resposta === "r1")
                newvalues = { $set: { r1: answers.r1 + 1 } };
            else if (resposta === "r2")
                newvalues = { $set: { r2: answers.r2 + 1 } };
            else if (resposta === "r3")
                newvalues = { $set: { r3: answers.r3 + 1 } };

            await this.db.UpdateAnswers(filter, newvalues);
            await this.db.UpdateCounter(answers);
            var checkCount = await this.db.findOne("answers", { sessionId: msg.sessionId, question: msg.question, fase: msg.fase, idTeam: msg.teamId }, {});
            console.log(checkCount.answered);
            answers = await this.db.findOne("answers", { sessionId: msg.sessionId, question: msg.question, fase: msg.fase, idTeam: msg.teamId }, {});
            //Quando todos os membros de um time responderem
            console.log(team.members.lenght);
            var membersWs = team.members.map(item => item.ws_id);
            var mensagem;
            if (checkCount.answered == team.members.length) {
                mensagem = {
                    "message_type": "MOMENTO_GRUPO",
                    "teamId": msg.teamId,
                    "teamId": team.idTeam,
                    "sessionId": msg.sessionId,
                    "gameId": msg.gameId,
                    "answer": {
                        "r": answers.r,
                        "r2": answers.r1,
                        "r3": answers.r2,
                        "r4": answers.r3
                    }

                }
            }
            else {
                mensagem = "Waiting Other members";
            }
            //manda a mensagem para todos os membros do time
            super.multicast(wss, membersWs, mensagem);

        }
        answer();
    }

    handleAskForHelp(wss, ws, msg) {
        const recuperarTime = async () => {

            var session = await this.db.findOne("sessions", { sessionId: msg.sessionId }, {});
            var team = await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

            var membersWs = team.members.map(item => item.ws_id);

            var mensagem = {
                "message_type": "AJUDA_EQUIPE",
                "teamId": msg.teamId,
                "sessionId": msg.sessionId,
                "gameId": msg.gameId,
                "help": msg.help
            };

            if (msg.help === "5050") {
                if (team.used5050 == session.nrHelp5050)
                    mensagem = {
                        "message_type": "AJUDA_EQUIPE",
                        "Número de ajudas esgotado!!": team.used5050
                    }
                else
                    await this.db.UpdateHelp(team);
            }
            super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
        }

        recuperarTime();

        if (msg.help === "pular")
            handleNextQuestiion(wss, ws, msg);
    }
    handleFinalAnswer(wss, ws, msg) {

        const findTeam = async () => {

            var team = await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
            var membersWs = team.members.map(item => item.ws_id);

            var mensagem = {
                "message_type": "FINAL_QUESTAO",
                "teamId": msg.teamId,
                "sessionId": msg.sessionId,
                "gameId": msg.gameId,
                "finalAnswer": msg.finalAnswer,
                "correct": msg.correct
            }

            super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
        }
        findTeam();
    }

    handleNextQuestion(wss, ws, msg) {
        const findTeam = async () => {

            var team = await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
            var membersWs = team.members.map(item => item.ws_id);

            var mensagem = {
                "message_type": "NOVA_QUESTAO",
                "teamId": msg.teamId,
                "sessionId": msg.sessionId,
                "gameId": msg.gameId,
            }

            super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
        }
        findTeam();
    }

    handleNextFase(wss, ws, msg) {
        const findTeam = async () => {

            var team = await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
            team.lastLeaders.push(team.lider);
            await this.db.UpdateLastLeader(team);
            var membersWs = team.members.map(item => item.ws_id);
            var newLeader = team.members[Math.floor(Math.random() * team.members.length)].id;
            team = await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

            while (team.lastLeaders.includes(newLeader)) { //não repetir o lider
                newLeader = team.members[Math.floor(Math.random() * team.members.length)].id;
            }
            team.lider = newLeader;
            await this.db.UpdateLeader(team);

            var mensagem = {
                "message_type": "INICIA_NOVA_FASE",
                "teamId": msg.teamId,
                "leaderId": newLeader,
                "sessionId": msg.sessionId,
                "gameId": msg.gameId,
            }

            super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
        }
        findTeam();
    }

    handleExit(wss, ws) {
        console.log('Handling Exit: ' + ws.id);
    }
}




module.exports = Handler;
