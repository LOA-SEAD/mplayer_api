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
    this.times_ws_id = new Map();
    this.sessoes = new Map();

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
    else if (msg.messageType == "MOMENTO_VOTACAO")
      this.handleMomentoVotacao(wss, ws, msg);
    else if (msg.messageType == "PEDIR_AJUDA")
      this.handleAskForHelp(wss, ws, msg);
    else if (msg.messageType == "RESPOSTA_FINAL")
      this.handleFinalAnswer(wss, ws, msg);
    else if (msg.messageType == "PROXIMA_FASE")
      this.handleNextFase(wss, ws, msg);
    else if (msg.messageType == "PROXIMA_QUESTAO")
      this.handleNextQuestion(wss, ws, msg);
    else if (msg.messageType == "AVALIACAO") {
      const avaliacao = async () => {
        await this.handleElogios(wss, ws, msg);
      }
      avaliacao();
    }
    else if (msg.messageType == "FIM_DE_JOGO") {
      const fimdejogo = async () => {
        await this.handleEndGame(wss, ws, msg);
      }
      fimdejogo();
    }
    else if (msg.messageType == "ENCERRAR_JOGO")
      this.handleEncerrar(wss, ws, msg);
    else if (msg.messageType == "MENSAGEM_CHAT")
      this.handleChat(wss, ws, msg);
    else if (msg.messageType == "DUVIDA")
      this.handleDuvida(wss, ws, msg);
  }

  handleCadastra(wss, ws, msg) {

    const cadastra = async () => {

      // Checando o número de questões

      var ok = true;
      for (var i = 0; ok && i < 3; i++) {
        ok = ok && msg.totalQuestion[i] > msg.questionAmount[i];
      }

      if (ok) { 

        // Apenas cria sessão se o número de questoes ok
        
        var userId = await this.db.getNextSequenceValue("usuarios");

        let moderator = { id: userId, name: msg.user.name };

        this.db.insertUsuario(moderator);

        var sessionId = await this.db.getNextSequenceValue("sessoes");

        this.db.insertSession({
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
            possibleLeaders: [],
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
      } else {
        console.log("Sessão não criada - número de questões inválidas");
      }
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
            ws_id: ws.id,
            rejectLeadership: msg.user.rejectLeadership
          };
          this.db.insertUsuario(user);

          var userTeam = { id: userId, name: msg.user.name, ws_id: ws.id, 
            indScore: 0, rejectLeadership: msg.user.rejectLeadership 
          };
          team.members.push(userTeam);

          if (!msg.user.rejectLeadership) {
            team.possibleLeaders.push(userTeam);
          }
          
          var members2 = team.members.map((item) => item.ws_id);

          var filter = { _id: team._id };
          var newValues = { $set: { members: team.members, possibleLeaders: team.possibleLeaders } };
          this.db.updateTeam(filter, newValues);

          var session = await this.db.findOne(
            "sessao",
            { sessionId: sessionId },
            {}
          );
          await this.db.updatePlayersInGame(session);
          // Apenas envia para o moderador e o quem deseja entrar na sessão

          var members2 = [user.ws_id, team.members[0].ws_id];

          var mensagem = {
            messageType: "ENTROU_SESSAO",
            user: { id: user.id, name: user.name, rejectLeadership: user.rejectLeadership },
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
            // Contador de membros do time que responderam (1a fase)
            
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
              D: 0
            });

            // Contador de membros do time que responderam (fase final)
            
            this.db.insertFinalAnswers({
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
              D: 0
            });
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
            help5050: session.nrHelp5050,
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
            pulou_na_fase: false,
            entrou_nova_fase: false,
          };
          console.log("membersWsIds[" + i + "] =>" + membersWsIds[i]);

          super.multicast(wss, membersWsIds[i], mensagem);

          await this.#sleep(2000).then(() => { console.log('Waited 2 seconds'); });     

        }

        // Adicionando o time no HashMap (para acelerar o envio de multicast)

        var membersWs = team[i].members.map((item) => item.ws_id);
        this.times_ws_id.set(team[i].idTeam, membersWs);
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

      if (resposta === "A") newvalues = { $inc: { A: 1, answered: 1 } };
      else if (resposta === "B") newvalues = { $inc: { B: 1, answered: 1 } };
      else if (resposta === "C") newvalues = { $inc: { C: 1, answered: 1 } };
      else if (resposta === "D") newvalues = { $inc: { D: 1, answered: 1 } };
      else newvalues = { $inc: { answered: 1 } };

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
          msg.pulou_na_fase = true;
          msg.entrou_nova_fase = false;
          this.handleNextQuestion(wss, ws, msg);
        }
      }

      super.multicast(wss, membersWs, mensagem); // informa todos os membros do time
    };

    recuperarTime();
  }

  handleFinalAnswer(wss, ws, msg) {

    const answer = async () => {

      var answers = await this.db.findOne(
        "respostaFinal",
        {
          sessionId: msg.sessionId,
          question: msg.nrQuestion,
          fase: msg.level,
          idTeam: msg.teamId,
        },
        {}
      );

      const resposta = msg.finalAnswer;
      var filter = { _id: answers._id };
      var newvalues;

      // Incrementa a contagem de respostas e alternativas

      if (resposta === "A") newvalues = { $inc: { A: 1, answered: 1 } };
      else if (resposta === "B") newvalues = { $inc: { B: 1, answered: 1 } };
      else if (resposta === "C") newvalues = { $inc: { C: 1, answered: 1 } };
      else if (resposta === "D") newvalues = { $inc: { D: 1, answered: 1 } };
      else newvalues = { $inc: { answered: 1 } };

      if (msg.isLeader) {
        newvalues["$set"] = { leaderAnswer: resposta };
      }

      // Atualização dos valores

      await this.db.updateFinalAnswers(filter, newvalues);

      answers = await this.db.findOne(
        "respostaFinal",
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

      var team = await this.db.findOne(
        "time",
        { sessionId: msg.sessionId, idTeam: msg.teamId },
        {}
      );

      // Quando todos os membros de um time responderem

      if (answers.answered == (team.members.length - 1)) {
        await this.#sendRespostaFinal(wss, msg, team, answers);
      } else {
        var mensagem = {
          messageType: "ESPERANDO_MEMBROS",
          teamId: msg.teamId
        };
        super.unicast(wss, ws.id, mensagem);
      }
    };

    answer();
  }

  /* handleFinalAnswer(wss, ws, msg) {

    const findTeam = async () => {

      const user = await this.db.findOne(
        "usuario",
        {
          sessionId: msg.sessionId,
          id: msg.user.id
        },
        {}
      );

      // 
      // TODO Perguntar ao Antonio.. interaction não está sendo enviado na mensagem
      // Por enquanto, será utilizado o id do usuário
      // Para testar a ordenação dos membros do mesmo grupo 
      //

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
  }*/

  handleChat(wss, ws, msg) {
    const findTeam = async () => {

      var membersWs;
      if (!this.times_ws_id.has(msg.teamId)) {
        let team = await this.db.findOne("time", {
          sessionId: msg.sessionId,
          idTeam: msg.teamId
        }, {});
        membersWs = team.members.map((item) => item.ws_id);
        this.times_ws_id.set(msg.teamId, membersWs);
      } else {
        membersWs = this.times_ws_id.get(msg.teamId);
      }

      var mensagem = {
        messageType: "MENSAGEM_CHAT",
        user: { id: msg.user.id, name: msg.user.name },
        teamId: msg.teamId,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        texto: msg.texto,
        moderator: msg.moderator
      };

      super.multicast(wss, membersWs, mensagem); //informa todos os membros do time
    };
    findTeam();
  }

  handleMomentoVotacao(wss, ws, msg) {
    const findTeam = async () => {

      var membersWs;
      if (!this.times_ws_id.has(msg.teamId)) {
        let team = await this.db.findOne("time", {
          sessionId: msg.sessionId,
          idTeam: msg.teamId
        }, {});
        membersWs = team.members.map((item) => item.ws_id);
        this.times_ws_id.set(msg.teamId, membersWs);
      } else {
        membersWs = this.times_ws_id.get(msg.teamId);
      }

      var mensagem = {
        messageType: "MOMENTO_VOTACAO",
        user: { id: msg.user.id, name: msg.user.name },
        teamId: msg.teamId,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        level: msg.level,
        nrQuestion: msg.nrQuestion 
      };

      super.multicast(wss, membersWs, mensagem); // Informa todos os membros do time
    };
    findTeam();
  }

  /*handleChat(wss, ws, msg) {
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
  }*/


  handleNextQuestion(wss, ws, msg) {

    const findTeam = async () => {

      var team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});
      var membersWs = team.members.map(item => item.ws_id);
      var ordemQuestoes = [0, 1, 2, 3];
      ordemQuestoes = this.#shuffleArray(ordemQuestoes);
      var mensagem = {
        messageType: "NOVA_QUESTAO",
        teamId: msg.teamId,
        alternativas: ordemQuestoes,
        sessionId: msg.sessionId,
        gameId: msg.gameId,
        pulou_na_fase: msg.pulou_na_fase,
        entrou_nova_fase: msg.entrou_nova_fase,
      }
        
      super.multicast(wss, membersWs, mensagem); // informa todos os membros do time
    };

    findTeam();
  }

  // handleElogios(wss, ws, msg) {

  //   const elogios = async () => {
  //     let user = [];
  //     for (var i = 0; i < msg.team.length; i++) {
  //       user[i] = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.team[i].user.id }, {});
  //       user[i].elogio1 = msg.team[i].user.elogio1;
  //       user[i].elogio2 = msg.team[i].user.elogio2;
  //       user[i].elogio3 = msg.team[i].user.elogio3;
  //       this.db.updateElogios(user[i]);
  //     }
  //     let mensagem = {
  //       messageType: "ELOGIOS_ATRIBUIDOS"
  //     }
  //     let wsIds = user.map((item) => item.ws_id);
  //     super.multicast(wss, wsIds, mensagem);


  //   };

  //   elogios();
  // }

  async handleElogios(wss, ws, msg) {
    const elogios = async () => {
      let user = [];
      for (var i = 0; i < msg.team.length; i++) {
        user[i] = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.team[i].id }, {});
        user[i].elogio1 = msg.team[i].elogio1;
        user[i].elogio2 = msg.team[i].elogio2;
        user[i].elogio3 = msg.team[i].elogio3;
        await this.db.updateElogios(user[i]);
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

  async handleExit(wss, ws) {
    console.log("Handling Exit: " + ws.id);

    var filter = { "members.ws_id": ws.id, "completed": false }

    var time = await this.db.findOne("time", filter);

    if (time != null) {

      console.log("[Antes] => ", time.members);

      var index = time.members.findIndex(
        (elemento) => elemento.ws_id === ws.id
      );

      if (index != -1) {

        var sessao = await this.db.findOne("sessao", { sessionId: time.sessionId });

        var membro = time.members[index];

        console.log(membro);

        if (!membro.moderator) {

          var msg_desconexao = {
            messageType: "DESCONEXAO",
            user: membro,
            teamId: time.idTeam,
            sessionId: time.sessionId,
            gameId: sessao.gameId
          }

          msg_desconexao.leaderId = -1;

          if (time.lider == membro.id) {

            console.log("Membro era lider");

            if (time.members.length > 2) {

              // Busca novo líder e constrói a mensagem com o Id do novo líder

              do {
                await this.#newLeader(time);
                // o lider atual pode ser sorteado novamente (todos foram lideres)
                // então solicita novamente a escolha de novo lider
              } while (time.lider == membro.lider);

              msg_desconexao.leaderId = time.lider;
            }
          } else {
            console.log("Membro não era lider");
          }

          console.log(msg_desconexao);

          // Removendo membro

          time.members.splice(index, 1);

          // Removendo membro da lista de lideres (se ele foi lider em algum momento) 

          var index2 = time.lastLeaders.findIndex(
            (elemento) => elemento === membro.id
          );

          if (index2 != -1) {
            time.lastLeaders.splice(index2, 1);
          }

          // Atualizando time

          filter = { _id: time._id };
          var newValues = { $set: { members: time.members, lastLeaders: time.lastLeaders } };
          this.db.updateTeam(filter, newValues);

          time = await this.db.findOne("time", filter);

          var membersWs = time.members.map((item) => item.ws_id);

          super.multicast(wss, membersWs, msg_desconexao);

          var mensagem = {
            messageType: "MENSAGEM_CHAT",
            user: { name: "<MENSAGEM DO SISTEMA>" },
            teamId: time.idTeam,
            sessionId: time.sessionId,
            gameId: sessao.gameId,
            texto: membro.name + " saiu do jogo",
            moderator: true
          };

          super.multicast(wss, membersWs, mensagem);

        } else {
          console.log("Membro era moderador - não foi retirado");
        }
      } else {
        console.log("Membro de nenhum time ou time já finalizou o jogo");
      }

      console.log("[Depois] => ", time.members);
    }
  }

  async handleEndGame(wss, ws, msg) {

    const updateScore = async () => {

      let team, filter, newValues;

      let user = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.user.id }, {});

      if (msg.messageType == "FIM_DE_JOGO") {

        // Checando se o ranking pode ser atualizado com os dados do time

        await this.#checkRanking(msg);

        // Atualiza o número de pessoas que terminaram o jogo

        team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

        filter = { _id: team._id };
        newValues = { $inc: { endedGame: 1 } };

        await this.db.updateTeam(filter, newValues);

        // Atualiza o score individual

        user.indScore = msg.user.indScore;
        await this.db.updateUserScore(user);

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

        if (!team.completed) {
          await this.#sendClassificacao(wss, msg, team);
        }
      }

      user = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.user.id }, {});

      // Envia mensagem para retorno de avaliação

      user = await this.db.findOne("usuario", { sessionId: msg.sessionId, id: msg.user.id }, {});

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
        "gameId": msg.gameId
      }

      super.unicast(wss, user.ws_id, mensagem_aval);
    }
    updateScore();
  }

  handleEncerrar(wss, ws, msg) {
    const sendMessage = async () => {

      let msg_encerrar = {
        "messageType": "ENCERRAR",
        "sessionId": msg.sessionId,
        "gameId": msg.gameId
      };

      let players = []
      var teams = await this.db.find("time", { sessionId: msg.sessionId }, {});

      for (let i = 0; i < teams.length; i++) {
        for (let j = 1; j < teams[i].members.length; j++) {
          players.push(teams[i].members[j]);
        }
      }

      var playersWs = players.map(item => item.ws_id);

      super.multicast(wss, playersWs, msg_encerrar);
    };
    sendMessage();

  }

  handleDuvida(wss, ws, msg) {
    const sendMessage = async () => {

      let team = await this.db.findOne("time", { sessionId: msg.sessionId, idTeam: msg.teamId }, {});

      let mensagemDuvida = {
        "messageType": "DUVIDA",
        "teamId": msg.teamId,
        "sessionId": msg.sessionId,
        "gameId": msg.gameId
      };

      // Enviar mensagem para o moderador
      super.unicast(wss, team.members[0].ws_id, mensagemDuvida);
    };

    sendMessage();
  }

  // Métodos privados

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

      if (team.lastLeaders.length == team.possibleLeaders.length) {
        // todos membros foram lideres
        team.lastLeaders.splice(0, team.lastLeaders.length);
      }

      await this.db.updateLastLeader(team);
    }

    var newLeader;

    // não repetir o lider

    do {  
      var index = Math.floor(Math.random() * 104729) % (team.possibleLeaders.length);
      newLeader = team.possibleLeaders[index].id;
    } while (team.lastLeaders.includes(newLeader));

    team.lider = newLeader;
    await this.db.updateLeader(team);
  }

  async #checkRanking(msg) {
    var sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });

    var index = sessao.ranking.findIndex(
      (elemento) => elemento.idTeam === msg.teamId
    );

    // Atualiza o ranking 

    if (index == -1) {
      var teamRanking = { idTeam: msg.teamId, point: msg.grpScore, gameTime: msg.gameTime, ranking: 0 };
      await this.db.addTeamRanking(sessao._id, teamRanking);
    }
  }

  async #updateRanking(msg) {

    let sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });

    // Ordenação do ranking com prioridade para Score do grupo 

    await sessao.ranking.sort(function (A, B) {
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
  }

  async #sendRespostaFinal(wss, msg, team, answers) {

    var answerList = [];
    answerList.push({ "alternativa": "A", "contador": answers.A });
    answerList.push({ "alternativa": "B", "contador": answers.B });
    answerList.push({ "alternativa": "C", "contador": answers.C });
    answerList.push({ "alternativa": "D", "contador": answers.D });

    answerList.sort(function (a, b) {
      return b.contador - a.contador;
    });

    var respostaFinal;
    const empatados = [answerList[0]];
    var i = 1;

    while (i < 4 && answerList[i].contador === answerList[0].contador) {
      empatados.push(answerList[i]);
      i++;
    }

    if (empatados.length === 1) {
      // Não houve empate
      respostaFinal = answerList[0].alternativa;
    } else {

      // Houve empate 

      var pos = empatados.findIndex(
        (elemento) => elemento.alternativa === answers.leaderAnswer
      );

      if (pos !== -1) {
        // O lider votou em uma das opções empatadas
        // Considerar o voto do lider como vencedor 
        respostaFinal = answers.leaderAnswer;
      } else {
        // O lider não votou em uma das opções empatadas
        // discutir esse caso 
        // por enquanto, sorteio dos empatados

        var index = Math.floor(Math.random() * 104729) % (empatados.length);

        respostaFinal = answerList[index].alternativa;
      }
    }

    var mensagem = {
      messageType: "FINAL_QUESTAO",
      teamId: msg.teamId,
      sessionId: msg.sessionId,
      gameId: msg.gameId,
      finalAnswer: respostaFinal,
      correct: (respostaFinal === msg.correct),
      tie: (empatados.length !== 1),
      interaction: msg.interaction,
      answers: {
        A: answers.A,
        B: answers.B,
        C: answers.C,
        D: answers.D,
      },
    };

    answers = await this.db.findOne(
      "respostaFinal",
      {
        sessionId: msg.sessionId,
        question: msg.nrQuestion,
        fase: msg.level,
        idTeam: msg.teamId,
      },
      {}
    );

    // Apenas envia se a mensagem não foi enviada

    if (!answers.completed) {
      var filter = { _id: answers._id };
      var newvalues = { $set: { completed: true } };
      await this.db.updateFinalAnswers(filter, newvalues);

      let membersWs = team.members.map((item) => item.ws_id);

      // manda a mensagem para todos os membros do time
      super.multicast(wss, membersWs, mensagem);
    }
  }

  async #sendClassificacao(wss, msg, team) {

    var newValues = { $set: { completed: true } };
    var filter = { _id: team._id };
    await this.db.updateTeam(filter, newValues);

    await this.#updateRanking(msg);

    var users = await this.db.listUsuarios(msg.sessionId);

    // Ordenação dos usuários

    users = users.sort(function (A, B) {
      if (A.indScore !== B.indScore) {
        return B.indScore - A.indScore;
      } else {
        return B.interaction - A.interaction;
      }
    });

    var sessao = await this.db.findOne("sessao", { sessionId: msg.sessionId });

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

    super.multicast(wss, playersWs, mensagemGrupos);
  }
}

module.exports = Handler_RSP;
