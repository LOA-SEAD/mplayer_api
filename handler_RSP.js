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
    else if (msg.messageType == "AVALIACAO")
      this.handleElogios(wss, ws, msg);
    else if (msg.messageType == "FIM_DE_JOGO" || msg.messageType == "ENCERRAR_JOGO")
      this.handleEndGame(wss, ws, msg);
    else if (msg.messageType == "MENSAGEM_CHAT")
      this.handleChat(wss, ws, msg);
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
        playersInGame: 0,
        perguntas: [],
        ranking: []
      });

      var idAndpasswords = [];

      for (var i = 1; i <= msg.nrTeams; i++) {
        var team = new Map();
        team.set("id", i);
        team.set("lider", -1);
        // var password = Math.floor((1 + Math.random()) * 0x100000000)
        //  .toString(16)
        //  .substring(1);
        var password = "senha" + i;
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
          maxSize: msg.nrPlayers + 1, // + 1 => o moderador faz parte do time
          grpScore: 0,
          gameTime: 0,
          endedGame: 0,
          interaction: 0,
          completed: false
        });
      }

      var mensagem = {
        messageType: "SESSAO_CRIADA",
        //"gameId": msg.gameId,
        teams: idAndpasswords,
        sessionId: sessionId,
        user: moderator
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
        var team = await this.db.findOne("time", { secret: secret, sessionId: sessionId }, {});

        if (team.members.length < team.maxSize) {
          let user = {
            id: userId,
            name: msg.user.name,
            teamId: team.idTeam,
            indScore: 0,
            interaction: 0,
            elogio1: 0,
            elogio2: 0,
            elogio3: 0,
            sessionId: sessionId,
            ws_id: ws.id
          };
          this.db.insertUsuario(user);

          team.members.push({ id: userId, name: msg.user.name, ws_id: ws.id, indScore: 0 });
          var members2 = team.members.map((item) => item.ws_id);

          // console.log(members2);

          var filter = { _id: team._id };
          var newValues = { $set: { members: team.members } };
          this.db.updateTeam(filter, newValues);

          var session = await this.db.findOne(
            "sessao",
            { sessionId: sessionId },
            {}
          );
          await this.db.updatePlayersInGame(session);
          // Apenas envia para o moderador e o quem deseja entrar na sessão

          var members2 = [user.ws_id, team.members[0].ws_id];

          // console.log(members2);

          var mensagem = {
            messageType: "ENTROU_SESSAO",
            user: { id: user.id, name: user.name },
            teamId: team.idTeam,
            sessionId: sessionId,
            gameId: session.gameId
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


      for (i = 0; i < 3; i++) {
        var S = new Set(); // Nao deixa adicionar elementos iguais
        while (S.size < session.questionRaffle[i] + 1) { // +1 => opção "pular"
          numero = Math.floor(Math.random() * session.totalQuestion[i] + 1);
          S.add(numero);
          // Cria um registro para cada pergunta
          for (j = 1; j <= session.nrTeams; j++) {
            // Contador de membros do time que responderam
            this.db.insertAnswers({
              sessionId: msg.sessionId,
              fase: i,
              question: numero,
              idTeam: j,
              ordemQuestoes: [0, 1, 2, 3],
              completed: false,
              answered: 0,
              A: 0,
              B: 0,
              C: 0,
              D: 0,
              vazio: 0
            })
          }
        }

        fase[i] = Array.from(S);
      }

      session.perguntas = fase;
      await this.db.updateQuestions(session); // Atualização do campo perguntas

      var team = await this.db.listTeams({ sessionId: msg.sessionId });
      var membersWsIds = [session.nrTeams];

      for (i = 0; i < session.nrTeams; i++) {

        if (team[i].members.length > 1) { // apenas se houver membros (o moderador é desconsiderado)

          await this.#newLeader(team[i]);

          // Math.floor(Math.random() * (team[i].members.length - 1)) + 1
          // Moderador faz parte do time => necessário removê-lo da lista de lideres

          // var index = Math.floor(Math.random() * (team[i].members.length - 1));

          // team[i].lider =
          //  team[i].members[
          //    index + 1
          //  ].id;

          // await this.db.updateLeader(team[i]);    

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

      const resposta = msg.answer;
      var filter = { _id: answers._id };
      var newvalues;

      // Incrementa a contagem de respostas e alternativas

      switch (resposta) {
        case "A":
          newvalues = { $inc: { A: 1, answered: 1 } };
          break;
        case "B":
          newvalues = { $inc: { B: 1, answered: 1 } };
          break;
        case "C":
          newvalues = { $inc: { C: 1, answered: 1 } };
          break;
        case "D":
          newvalues = { $inc: { D: 1, answered: 1 } };
          break;
        default:
          newvalues = { $inc: { vazio: 1, answered: 1 } };
          break;
      }

      // Atualização dos valores
      await this.db.updateAnswers(filter, newvalues);

      var team = await this.db.findOne(
        "time",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
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

      // console.log("[" + msg.teamId + "] answers.completed = " + answers.completed);
      // console.log("[" + msg.teamId + "] answers.answered = " + answers.answered);
      // console.log("[" + msg.teamId + "] team.members.length = " + team.members.length);

      let mensagem;

      // Quando todos os membros de um time responderem

      if (answers.answered == (team.members.length - 1)) {

        mensagem = {
          messageType: "MOMENTO_GRUPO",
          teamId: msg.teamId,
          leaderId: team.lider,
          sessionId: msg.sessionId,
          gameId: msg.gameId,
          answer: {
            A: answers.A,
            B: answers.B,
            C: answers.C,
            D: answers.D,
          },
        };

        // Apenas envia se a mensagem não foi enviada

        if (!answers.completed) {
          newvalues = { $set: { completed: true } };
          await this.db.updateAnswers(filter, newvalues);

          let membersWs = team.members.map((item) => item.ws_id);

          // manda a mensagem para todos os membros do time
          super.multicast(wss, membersWs, mensagem);
        }
      } else {
        mensagem = {
          messageType: "ESPERANDO_MEMBROS",
          teamId: msg.teamId
        };
        super.unicast(wss, ws.id, mensagem);
      }
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

      super.multicast(wss, membersWs, mensagem); // informa todos os membros do time
    };

    recuperarTime();
  }

  handleFinalAnswer(wss, ws, msg) {

    const findTeam = async () => {

      const user = await this.db.findOne(
        "usuario",
        {
          // sessionId: msg.sessionId,
          id: msg.user.id
        },
        {}
      );

      /* 
       * TODO Perguntar ao Antonio.. interaction não está sendo enviado na mensagem
       * Por enquanto, será utilizado o id do usuário
       * Para testar a ordenação dos membros do mesmo grupo 
       */

      user.interaction = msg.user.id;
      await this.db.updateInteraction(user);

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
        interaction: msg.interaction
      };

      super.multicast(wss, membersWs, mensagem); // informa todos os membros do time
    };

    findTeam();
  }

  handleChat(wss, ws, msg) {
    const findTeam = async () => {

      const user = await this.db.findOne(
        "usuario",
        {
          // sessionId: msg.sessionId,
          id: msg.user.id
        },
        {}
      );

      let team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
      var membersWs = team.members.map((item) => item.ws_id);

      var mensagem = {
        messageType: "MENSAGEM_CHAT",
        user: { id: user.id, name: user.name },
        teamId: msg.teamId,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        texto: msg.texto,
      };

      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };
    findTeam();
  }

  handleNextQuestion(wss, ws, msg) {

    const findTeam = async () => {

      var team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
      var membersWs = team.members.map(item => item.ws_id);
      var ordemQuestoes = [0, 1, 2, 3];
      ordemQuestoes = this.#shuffleArray(ordemQuestoes);
      var mensagem = {
        "messageType": "NOVA_QUESTAO",
        "teamId": msg.teamId,
        "alternativas": ordemQuestoes,
        "sessionId": msg.sessionId,
        "gameId": msg.gameId,
      }

      super.multicast(wss, membersWs, mensagem); // informa todos os membros do time
    };

    findTeam();
  }

  handleElogios(wss, ws, msg) {

    const elogios = async () => {
      let user = [];
      for (var i = 0; i < msg.team.length; i++) {
        // user[i] = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.team[i].user.id }, {});
        user[i] = await this.db.findOne("usuario", { id: msg.team[i].user.id }, {});
        user[i].elogio1 = msg.team[i].user.elogio1;
        user[i].elogio2 = msg.team[i].user.elogio2;
        user[i].elogio3 = msg.team[i].user.elogio3;
        this.db.updateElogios(user[i]);
      }
      let mensagem = {
        messageType: "ELOGIOS_ATRIBUIDOS"
      }
      let wsIds = user.map((item) => item.ws_id);
      super.multicast(wss, wsIds, mensagem);


    };

    elogios();
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

      let team, sessao, users, filter, newValues;

      if (msg.messageType == "FIM_DE_JOGO") {

        // Procura a sessão

        sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });

        team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

        // Atualiza o ranking 

        if (team.endedGame == 0) {
          // console.log("Atualizando Ranking");
          sessao.ranking.push({ idTeam: msg.teamId, point: msg.grpScore, gameTime: msg.gameTime, ranking: 0 });
          await this.db.updateRanking(sessao);
        }

        // Atualiza o número de pessoas que terminaram o jogo

        filter = { _id: team._id };
        newValues = { $inc: { endedGame: 1 } };

        await this.db.updateTeam(filter, newValues);

        // Procura o usuário e atualiza o score individual

        // let user = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.user.id }, {});
        let user = await this.db.findOne("usuario", { id: msg.user.id }, {});

        user.indScore = msg.user.indScore;
        await this.db.updateUserScore(user);

        let received = [];
        received.push({
          elogio1: user.elogio1,
          elogio2: user.elogio2,
          elogio3: user.elogio3
        });

        let mensagem_aval = {
          "messageType": "RETORNA_AVALIACAO",
          "user": user,
          "received": received,
          "sessionId": msg.sessionId,
          "gameId": sessao.gameId
        }

        super.unicast(wss, user.ws_id, mensagem_aval);

        // Atualiza o número de pessoas que terminaram o jogo

        // await this.db.updateEndCounter(sessao);

        // Sessão com os valores atualizados

        // sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });
      }

      team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

      // console.log("[" + msg.teamId + "] team.completed = " + team.completed);
      // console.log("[" + msg.teamId + "] team.endedGame = " + team.endedGame);
      // console.log("[" + msg.teamId + "] team.members.length = " + team.members.length);
      // console.log("[" + msg.teamId + "] team.leader.id = " + team.lider);
      // console.log("[" + msg.teamId + "] user.id = " + msg.user.id);

      if (team.endedGame == team.members.length - 1 || msg.messageType == "ENCERRAR_JOGO") {

        team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

        if (!team.completed && team.lider == msg.user.id) {

          newValues = { $set: { completed: true } };
          await this.db.updateTeam(filter, newValues);

          sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });

          // Ordenação do ranking com prioridade para Score do grupo 

          sessao.ranking.sort(function (A, B) {
            if (A.point !== B.point) {
              return B.point - A.point;
            } else {
              return A.gameTime - B.gameTime;
            }
          });

          // Atualiza a ordem seguindo o Ranking

          await this.db.updateRanking(sessao);

          sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });

          // Adiciona os índices aos rankings

          for (let i = 0; i < sessao.ranking.length; i++) {
            sessao.ranking[i].ranking = i + 1;
          }

          // Atualização das variáveis

          await this.db.updateRanking(sessao);

          users = await this.db.listUsuarios(msg.sessionId);

          // Ordenação dos usuários

          users = users.sort(function (A, B) {
            if (A.indScore !== B.indScore) {
              return B.indScore - A.indScore;
            } else {
              return B.interaction - A.interaction;
            }
          });

          let mensagemModerador = {
            "messageType": "CLASSIFICACAO_FINAL_MODERADOR",
            "teams": sessao.ranking,
            "user": users,
            "sessionId": msg.sessionId,
            "gameId": sessao.gameId
          }

          super.unicast(wss, team.members[0].ws_id, mensagemModerador);

          let mensagemGrupos = {
            "messageType": "CLASSIFICACAO_FINAL",
            "teams": sessao.ranking,
            "sessionId": msg.sessionId,
            "gameId": sessao.gameId
          }

          let times = await this.db.find("time", { sessionId: msg.sessionId, completed: true }, {});

          let players = []

          for (let i = 0; i < times.length; i++) {
            for (let j = 1; j < times[i].members.length; j++) {
              players.push(times[i].members[j]);
            }
          }

          var playersWs = players.map(item => item.ws_id);

          // console.log(playersWs);

          super.multicast(wss, playersWs, mensagemGrupos);

          /*
          const usersElogio = users.map(function (item) {
            return {
              "user": item.userId,
              "name": item.name,
              "elogio1": item.elogio1,
              "elogio2": item.elogio2,
              "elogio3": item.elogio3
            };
          });

          mensagem = {
            "messageType": "CLASSIFICACAO_FINAL",
            "teams": sessao.ranking,
            "user": { "id": 0 }, //?
            "teamId": msg.teamId,
            "elogios": usersElogio,
            "sessionId": msg.sessionId
          }
          super.multicast(wss, wsIds, mensagem);

          users = users.map(function (item) {
            return {
              "teamId": item.teamId,
              "id": item.id,
              "indScore": item.indScore,
              "interaction": item.interaction
            };
          });

          let mensagemProfessor = {
            "messageType": "CLASSIFICACAO_FINAL_MODERADOR",
            "teams": sessao.ranking,
            "user": users,
            "sessionId": msg.sessionId
          }

          super.unicast(wss, team.members[0].ws_id, mensagemProfessor)
          */
        }
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
