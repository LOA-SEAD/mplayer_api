const WebSocket = require("ws");
const API = require("./api");
const DB = require("./db");

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
    if (msg.messageType == "ENTRAR_SESSAO") this.handleEnterTeam(wss, ws, msg);
    else if (msg.messageType == "CADASTRAR_SESSAO")
      this.handleCadastra(wss, ws, msg);
    else if (msg.messageType == "COMECAR_JOGO") this.handleStart(wss, ws, msg);
    else if (msg.messageType == "RESPOSTA_INDIVIDUAL")
      this.handleIndividualMoment(wss, ws, msg);
    else if (msg.messageType == "PEDIR_AJUDA")
      this.handleAskForHelp(wss, ws, msg);
    else if (msg.messageType == "RESPOSTA_FINAL")
      this.handleFinalAnswer(wss, ws, msg);
    else if (msg.messageType == "PROXIMA_QUESTAO")
      this.handleNextQuestion(wss, ws, msg);
    else if (msg.messageType == "PROXIMA_FASE")
      this.handleNextFase(wss, ws, msg);
  }

  handleCadastra(wss, ws, msg) {
    const cadastra = async () => {
      var userId = await this.db.getNextSequenceValue("usuarios");

      console.log("userId = " + userId);

      let moderator = { id: userId, name: msg.user.name };

      this.db.insertUsuario(moderator);

      var sessionId = await this.db.getNextSequenceValue("sessoes");

      console.log("sessionId = " + sessionId);

      this.db.gameInfo({
        gameId: msg.gameId,
        nrTeams: msg.nrTeams,
        nrPlayers: msg.nrPlayers,
        nrHelp5050: msg.nrHelp5050,
        timeQuestion: msg.timeQuestion,
        totalQuestion: msg.totalQuestion,
        questionRaffle: msg.questionAmount,
        moderator: moderator,
        sessionId: sessionId,
        endedGame:0,
        perguntas: [], //atualizar depois do sorteio das perguntas
      });

      var idAndpasswords = [];

      for (var i = 1; i <= msg.nrTeams; i++) {
        var team = new Map();
        team.set("id", i);
        team.set("lider", -1);
        var password = Math.floor((1 + Math.random()) * 0x100000000)
          .toString(16)
          .substring(1);
        team.set("password", password);
        team.set("members", []);
        this.teams.push(team);
        idAndpasswords.push({
          id: team.get("id"),
          secret: team.get("password"),
        });
        this.db.insertTeam({
          idTeam: team.get("id"),
          secret: team.get("password"),
          sessionId: sessionId,
          lider: 0, //atualizar no sorteio
          used5050: 0,
          lastLeaders: [],
          members: [{ id: userId, name: msg.user.name, ws_id: ws.id, indScore:0 }],
          maxSize: msg.nrPlayers + 1,
          grpScore:0,
          gameTime:0,
          endedGame:0,
          interaction:0
        });
      }

      var mensagem = {
        messageType: "SESSAO_CRIADA",
        //"gameId": msg.gameId,
        teams: idAndpasswords,
        sessionId: sessionId,
      };

      super.unicast(wss, ws.id, mensagem);
    };

    cadastra();
  }

  handleEnterTeam(wss, ws, msg) {
    var pos = msg.secret.indexOf("@");
    var sessionId = parseInt(msg.secret.substring(0, pos));
    var secret = msg.secret.substring(pos + 1);

    const findIdsAndPasswords = async () => {
      console.log("sessionId = " + sessionId);
      console.log("senha = " + secret);

      var userId = await this.db.getNextSequenceValue("usuarios");

      var idAndpasswords = await this.db.find(
        "times",
        { sessionId: sessionId },
        { secret: 1, _id: 0 }
      );
      console.log(idAndpasswords);
      var index = idAndpasswords.findIndex(
        (elemento) => elemento.secret === secret
      );

      if (index != -1) {
        var team = await this.db.findOne("times", { secret: secret }, {});
        console.log(team);

        if (team.members.length < team.maxSize) {
          let user = {
            id: userId,
            name: msg.user.name,
            indScore:0,
            sessionId:sessionId
          };
          this.db.insertUsuario(user);

          team.members.push({ id: userId, name: msg.user.name, ws_id: ws.id });
          var members2 = team.members.map((item) => item.ws_id);
          console.log(members2);
          this.db.UpdateTeam(team);

          console.log(team);

          var session = await this.db.findOne(
            "sessions",
            { sessionId: sessionId },
            {}
          );

          var mensagem = {
            messageType: "ENTROU_SESSAO",
            user: { id: user.id, name: user.name },
            teamId: team.idTeam,
            sessionId: sessionId,
            gameId: session.gameId,
          };

          super.multicast(wss, members2, mensagem);
        } else {
          var mensagem = {
            messageType: "ACESSO_INVALIDO",
            reason: "EXCEEDED_MAXIMUM_NUMBER_PARTICIPANTS",
          };

          super.unicast(wss, ws.id, mensagem);
        }
      } else {
        var mensagem = {
          messageType: "ACESSO_INVALIDO",
          reason: "WRONG_PASSWORD",
        };

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
      var session = await this.db.findOne(
        "sessions",
        { sessionId: msg.sessionId },
        {}
      );
      var numberTeams = await this.db.findOne(
        "sessions",
        { sessionId: msg.sessionId },
        {}
      );
      for (i = 0; i < 3; i++) {
        var S = new Set(); //nao deixa adicionar elementos iguais
        while (S.size < session.questionRaffle[i]) {
          numero = Math.floor(Math.random() * session.totalQuestion[i] + 1);
          S.add(numero);
          //Cria um registro para cada pergunta
          for (j = 1; j <= session.nrTeams; j++) {
            //contador de membros do time que responderam
            this.db.insertAnswers({
              sessionId: msg.sessionId,
              fase: i,
              question: numero,
              idTeam: j,
              ordemQuestoes:[0,1,2,3],
              answered: 0,
              A:0,
              B:0,
              C:0,
              D:0
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
        team[i].lider =
          team[i].members[
            Math.floor(Math.random() * team[i].members.length)
          ].id;
        await this.db.UpdateLeader(team[i]);
        membersWsIds[i] = team[i].members.map((item) => item.ws_id);
      }

      for (i = 0; i < session.nrTeams; i++) {
        await this.db.UpdateLeader(team[i]);
        var mensagem = {
          messageType: "INICIA_JOGO",
          totalQuestion: session.totalQuestion,
          question: {
            easy: fase[0],
            medium: fase[1],
            hard: fase[2],
          },
          team: team[i].members,
          timeQuestion: session.timeQuestion,
          leaderId: team[i].lider,
          sessionId: session.sessionId,
          gameId: session.gameId,
        };
        super.multicast(wss, membersWsIds[i], mensagem);
      }

      for (i = 0; i < session.nrTeams; i++) {
        var alternativas = new Set(); //nao deixa adicionar elementos iguais
        while (alternativas.size < 4) {
          numero = Math.floor(Math.random() * 4);
          alternativas.add(numero);
        }
        var mensagem = {
          messageType: "NOVA_QUESTAO",
          alternativas: Array.from(alternativas),
          teamId: team[i].idTeam,
          leaderId: team[i].lider,
          sessionId: session.sessionId,
          gameId: session.gameId,
        };
        super.multicast(wss, membersWsIds[i], mensagem);
      }
    };
    findSession();
  }

  handleIndividualMoment(wss, ws, msg) {
    const answer = async () => {
      var answers = await this.db.findOne(
        "answers",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );
      var team = await this.db.findOne(
        "times",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      const resposta = msg.answer;
      var filter = { _id: answers._id };
      var newvalues;

      if (resposta === "A") newvalues = { $set: { A: answers.A + 1 } };
      else if (resposta === "B") newvalues = { $set: { B: answers.B + 1 } };
      else if (resposta === "C") newvalues = { $set: { C: answers.C + 1 } };
      else if (resposta === "D") newvalues = { $set: { D: answers.D + 1 } };

      await this.db.UpdateAnswers(filter, newvalues);
      await this.db.UpdateCounter(answers);
      var checkCount = await this.db.findOne(
        "answers",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );
      console.log(checkCount.answered);
      answers = await this.db.findOne(
        "answers",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );
      //Quando todos os membros de um time responderem
      console.log(team.members.lenght);
      let membersWs = team.members.map((item) => item.ws_id);
      let mensagem;
      if (checkCount.answered == (team.members.length - 1)) {
        mensagem = {
          message_type: "MOMENTO_GRUPO",
          teamId: msg.teamId,
          teamId: team.idTeam,
          sessionId: msg.sessionId,
          gameId: msg.gameId,
          answer: {
            A: answers.A,
            B: answers.B,
            C: answers.C,
            D: answers.D,
          },
        };
      } else {
        mensagem = "Waiting Other members";
      }
      //manda a mensagem para todos os membros do time
      super.multicast(wss, membersWs, mensagem);
    };
    answer();
  }

  handleAskForHelp(wss, ws, msg) {
    const recuperarTime = async () => {
      var session = await this.db.findOne(
        "sessions",
        { sessionId: msg.sessionId },
        {}
      );
      var team = await this.db.findOne(
        "times",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      var membersWs = team.members.map((item) => item.ws_id);

      var mensagem = {
        message_type: "AJUDA_EQUIPE",
        teamId: msg.teamId,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        help: msg.help,
      };

      if (msg.help === "5050") {
        if (team.used5050 == session.nrHelp5050){
          mensagem = {
            message_type: "AJUDA_EQUIPE",
            "Número de ajudas esgotado!!": team.used5050,
          };
        }
         else {
          var question = await this.db.findOne("answers", {sessionId: msg.sessionId, question: msg.nrQuestion, fase:msg.level,idTeam: msg.teamId}, { });
          await this.db.UpdateHelp(team);
          var fifth = [question.ordemQuestoes.indexOf(0),question.ordemQuestoes.indexOf(Math.floor(Math.random() * 3) + 1)];
          fifth = shuffleArray(fifth);
          mensagem  = {
            "message_type":"AJUDA_EQUIPE",
            "teamId": msg.teamId,
            "sessionId":msg.sessionId,
            "gameId":msg.gameId,
            "help": msg.help,   
            "alternativa":fifth
        }
        }
      }
      else{
          if(team.usedSkip>=1){
          mensagem = {
             "message_type":"AJUDA_EQUIPE",
             "Número de pulos!!": 1
         }
      }
       else{
         await this.db.UpdateSkip(team);
         this.handleNextQuestion(wss,ws,msg);
      }
      }
        
      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };

    recuperarTime();
  }
  
  handleFinalAnswer(wss, ws, msg) {
    const findTeam = async () => {
      var team = await this.db.findOne(
        "times",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );
      var membersWs = team.members.map((item) => item.ws_id);

      var mensagem = {
        message_type: "FINAL_QUESTAO",
        teamId: msg.teamId,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        finalAnswer: msg.finalAnswer,
        correct: msg.correct,
      };

      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };
    findTeam();
  }

  handleNextQuestion(wss, ws, msg) {
    const findTeam = async()=>{ 
            
      var answers = await this.db.findOne("answers", {sessionId: msg.sessionId, question: msg.nrQuestion, fase:msg.level,idTeam: msg.teamId}, { });
      console.log(answers);
      var team =  await this.db.findOne("times", { sessionId: msg.sessionId, idTeam: msg.teamId }, { });
      var membersWs = team.members.map(item => item.ws_id);
      answers.ordemQuestoes = shuffleArray(answers.ordemQuestoes);
      await this.db.UpdateOrdem(answers);
      var mensagem = {
          "message_type":"NOVA_QUESTAO",
          "teamId":msg.teamId,
          "alernativas":answers.ordemQuestoes,
          "sessionId":msg.sessionId,
          "gameId":msg.gameId,
          }
      
        super.multicast(wss,membersWs,mensagem); //informa todos os membros do time
     };
     findTeam();
  }

  handleNextFase(wss, ws, msg) {
    const findTeam = async () => {
      var team = await this.db.findOne(
        "times",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );
      team.lastLeaders.push(team.lider);
      await this.db.UpdateLastLeader(team);
      var membersWs = team.members.map((item) => item.ws_id);
      var newLeader =
        team.members[Math.floor(Math.random() * team.members.length)].id;
      team = await this.db.findOne(
        "times",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      while (team.lastLeaders.includes(newLeader)) {
        //não repetir o lider
        newLeader =
          team.members[Math.floor(Math.random() * team.members.length)].id;
      }
      team.lider = newLeader;
      await this.db.UpdateLeader(team);

      var mensagem = {
        message_type: "INICIA_NOVA_FASE",
        teamId: msg.teamId,
        leaderId: newLeader,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
      };

      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };
    findTeam();
  }

  handleExit(wss, ws) {
    console.log("Handling Exit: " + ws.id);
  }

  handleEndGame(wss,ws,msg){
    const updateScore = async()=>{
      const team = await this.db.findOne("times",{ sessionId: msg.sessionId, idTeam: msg.teamId },{});
      team.grpScore = msg.grpScore; 
      // const index = team.members.id.indexOf(msg.id) ;
      await this.db.UpdateTeamScore(team);
      // await this.db.UpdateIndScore(team,index);
      const user = await this.db.findOne("usuario",{ sessionId: msg.sessionId, id: msg.userId },{});
      user.indScore = msg.indScore;
      await this.db.UpdateUserScore(user);
      await this.db.UpdateEndCounter(team);
      //Time com valores atualizados
      team = await this.db.findOne("times",{ sessionId: msg.sessionId, idTeam: msg.teamId },{}); 
      if(team.endedGame == (team.members.length - 1)){

      }
    }
    updateScore();
  }
  
}
   

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = Handler;
