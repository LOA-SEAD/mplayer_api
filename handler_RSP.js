const WebSocket = require("ws");
const Handler = require("./handler");
const DB_RSP = require("./db_RSP");

class Handler_RSP extends Handler {
  constructor() {
    super();
    this.connections_id = [];
    this.players = [];
    this.teams = [];
    this.db = new DB_RSP();

    this.totalAnswers = [0];
  }

  handleMsg(wss, ws, msg) {
    if (msg.messageType == "ENTRAR_SESSAO")
      this.handleEnterTeam(wss, ws, msg);
    else if (msg.messageType == "CADASTRAR_SESSAO")
      this.handleCadastra(wss, ws, msg);
    else if (msg.messageType == "COMECAR_JOGO")
      this.handleStart(wss, ws, msg);
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

      let moderator = { id: userId, name: msg.user.name };

      this.db.insertUsuario(moderator);

      var sessionId = await this.db.getNextSequenceValue("sessoes");

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
        endedGame: 0,
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
          members: [{ id: userId, name: msg.user.name, ws_id: ws.id, moderator: true }],
          maxSize: msg.nrPlayers + 1,
          grpScore: 0,
          gameTime: 0,
          endedGame: 0,
          interaction: 0
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
      
      var userId = await this.db.getNextSequenceValue("usuarios");

      var idAndpasswords = await this.db.find(
        "time",
        { sessionId: sessionId },
        { secret: 1, _id: 0 }
      );
      
      var index = idAndpasswords.findIndex(
        (elemento) => elemento.secret === secret
      );

      if (index != -1) {
        var team = await this.db.findOne("time", { secret: secret }, {});

        if (team.members.length < team.maxSize + 1) { // +1 => o moderador faz parte do time
          let user = {
            id: userId,
            name: msg.user.name,
            indScore: 0,
            sessionId: sessionId
          };
          this.db.insertUsuario(user);

          var usuario = { id: userId, name: msg.user.name, ws_id: ws.id, indScore: 0 };
		  team.members.push(usuario);
          var members2 = [];
          members2.push(usuario.ws_id);
          members2.push(team.members[0].ws_id);
          console.log(members2);

          this.db.updateTeam(team);

          var session = await this.db.findOne(
            "sessao",
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
        "sessao",
        { sessionId: msg.sessionId },
        {}
      );
      var numberTeams = await this.db.findOne(
        "sessao",
        { sessionId: msg.sessionId },
        {}
      );
      for (i = 0; i < 3; i++) {
        var S = new Set(); //nao deixa adicionar elementos iguais
        while (S.size < session.questionRaffle[i] + 1) { // +1 => opção "pular"
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
              ordemQuestoes: [0, 1, 2, 3],
              answered: 0,
              A: 0,
              B: 0,
              C: 0,
              D: 0
            })
          }
        }

        fase[i] = Array.from(S);
      }

      session.perguntas = fase;
      await this.db.updateQuestions(session); //Atualização do campo perguntas

      var team = await this.db.listTeams({ sessionId: msg.sessionId });
      var membersWsIds = [session.nrTeams];

      for (i = 0; i < session.nrTeams; i++) {

        if (team[i].members.length > 1) { // apenas se houver membros (o moderador é desconsiderado)

          await this.#newLeader(team[i]);

          // Math.floor(Math.random() * (team[i].members.length - 1)) + 1
          // Moderador faz parte do time => necessário removê-lo da lista de lideres

          //var index = Math.floor(Math.random() * (team[i].members.length - 1));

          //team[i].lider =
          //  team[i].members[
          //    index + 1
          //  ].id;

          //await this.db.updateLeader(team[i]);

          membersWsIds[i] = team[i].members.map((item) => item.ws_id);
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
      }

      for (i = 0; i < session.nrTeams; i++) {
        if (team[i].members.length > 1) { // apenas se houver membros (o moderador é desconsiderado)
          var alternativas = new Set(); // nao deixa adicionar elementos iguais
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
      }
    };
    findSession();
  }

  handleIndividualMoment(wss, ws, msg) {
    const answer = async () => {
      var answers = await this.db.findOne(
        "resposta",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );
      var team = await this.db.findOne(
        "time",
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

      await this.db.updateAnswers(filter, newvalues);
      await this.db.updateCounter(answers);
      var checkCount = await this.db.findOne(
        "resposta",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );
      
      answers = await this.db.findOne(
        "resposta",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );
      
      let membersWs = team.members.map((item) => item.ws_id);
      let mensagem;
      
      //Quando todos os membros de um time responderem

      if (checkCount.answered == (team.members.length - 1)) {
        mensagem = {
          messageType: "MOMENTO_GRUPO",
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
        mensagem = {
          messageType: "ESPERANDO_MEMBROS"
        };
      }
      //manda a mensagem para todos os membros do time
      super.multicast(wss, membersWs, mensagem);
    };
    answer();
  }

  handleAskForHelp(wss, ws, msg) {
    const recuperarTime = async () => {
      var session = await this.db.findOne(
        "sessao",
        { sessionId: msg.sessionId },
        {}
      );
      var team = await this.db.findOne(
        "time",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      var membersWs = team.members.map((item) => item.ws_id);

      var mensagem = {
        messageType: "AJUDA_EQUIPE",
        teamId: msg.teamId,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        help: msg.help,
      };

      if (msg.help === "5050") {
        if (team.used5050 == session.nrHelp5050) {
          mensagem = {
            messageType: "AJUDA_EQUIPE",
            "Número de ajudas esgotado!!": team.used5050,
          };
        }
        else {
          var question = await this.db.findOne("resposta", { sessionId: msg.sessionId, question: msg.nrQuestion, fase: msg.level, idTeam: msg.teamId }, {});
          await this.db.updateHelp(team);
          var fifth = [question.ordemQuestoes.indexOf(0), question.ordemQuestoes.indexOf(Math.floor(Math.random() * 3) + 1)];
          fifth = this.#shuffleArray(fifth);
          mensagem = {
            "messageType": "AJUDA_EQUIPE",
            "teamId": msg.teamId,
            "sessionId": msg.sessionId,
            "gameId": msg.gameId,
            "help": msg.help,
            "alternativa": fifth
          }
        }
      }
      else {
        if (team.usedSkip >= 1) {
          mensagem = {
            "messageType": "AJUDA_EQUIPE",
            "Número de pulos !!": 1
          }
        }
        else {
          await this.db.updateSkip(team);
          this.handleNextQuestion(wss, ws, msg);
        }
      }

      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };

    recuperarTime();
  }

  handleFinalAnswer(wss, ws, msg) {
    const findTeam = async () => {

      var team = await this.db.findOne(
        "time",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );
      var membersWs = team.members.map((item) => item.ws_id);

      var mensagem = {
        messageType: "FINAL_QUESTAO",
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
    const findTeam = async () => {

      var answers = await this.db.findOne("resposta", { sessionId: msg.sessionId, question: msg.nrQuestion, fase: msg.level, idTeam: msg.teamId }, {});
      var team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
      var membersWs = team.members.map(item => item.ws_id);
      answers.ordemQuestoes = this.#shuffleArray(answers.ordemQuestoes);
      await this.db.updateOrdem(answers);
      var mensagem = {
        "messageType": "NOVA_QUESTAO",
        "teamId": msg.teamId,
        "alternativas": answers.ordemQuestoes,
        "sessionId": msg.sessionId,
        "gameId": msg.gameId,
      }

      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };
    findTeam();
  }

  handleNextFase(wss, ws, msg) {
    const findTeam = async () => {
      var team = await this.db.findOne(
        "time",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      var membersWs = team.members.map((item) => item.ws_id);

      team = await this.db.findOne(
        "time",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      await this.#newLeader(team);

      var mensagem = {
        messageType: "INICIA_NOVA_FASE",
        teamId: msg.teamId,
        leaderId: team.lider,
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

  handleEndGame(wss, ws, msg) {
    const updateScore = async () => {
      const team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
      team.grpScore = msg.grpScore;
      // const index = team.members.id.indexOf(msg.id) ;
      await this.db.updateTeamScore(team);
      // await this.db.UpdateIndScore(team,index);
      const user = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.userId }, {});
      user.indScore = msg.indScore;
      await this.db.updateUserScore(user);
      await this.db.updateEndCounter(team);
      //Time com valores atualizados
      team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
      if (team.endedGame == (team.members.length - 1)) {

      }
    }
    updateScore();
  }

  // Métodos privados

  #shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async #newLeader(team) {

    if (team.lider != 0) {
      team.lastLeaders.push(team.lider);

      if (team.lastLeaders.length == team.members.length - 1) {
        // todos membros foram lideres
        team.lastLeaders = []
      }

      await this.db.updateLastLeader(team);
    }

    var newLeader;

    // não repetir o lider

    do {
      // Math.floor(Math.random() * (team[i].members.length - 1)) + 1
      // Moderador faz parte do time => necessário removê-lo da lista de lideres  
      var index = Math.floor(Math.random() * (team.members.length - 1));
      newLeader = team.members[index + 1].id;
    } while (team.lastLeaders.includes(newLeader));

    team.lider = newLeader;
    await this.db.updateLeader(team);
  }
}

module.exports = Handler_RSP;
