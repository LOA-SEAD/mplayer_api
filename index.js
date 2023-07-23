//index.js
const { handle } = require('express/lib/router');
const app = require('./app');
const appWs = require('./app-ws');
const Handler = require('./handler');

const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`App Express is running!`);
})


/* var msg={
    messageType: "ENTRAR_SESSAO",
    user: {
		nome: "Fulano"
    },
    secret: "23@02468"
    };
var msg1 = {
  "messageType": "CADASTRA_SESSAO",
  "moderador"{"nome":, "id":}
  "nroEquipes": 3,
  "nroAlunos": 6
  "tempoMaximo": msg.tempoMaximo,
  "qtdePulos": msg.qntPulos,
  "qtde5050":
};    
var msg2 = {
   messageType: "ENTRAR_TIME",
   user:{
    nome: "fulano"
   },
   secret:"xyzw"
}; */   

/*var msg3={
  "messageType":"COMECAR_JOGO",
  "nroTotal":[4, 4, 4],
  "nrSorteadas":[2, 2, 2],
}*/
//const handler= new Handler();
//handler.handleStart(null,null,msg3);
/* handler.handleCadastra(null,null,msg1);
handler.handleEnter(null,null,msg);
handler.handleEnterTeam(null,null,msg2); */
appWs(server, new Handler());