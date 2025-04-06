const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Stockage des comptes (username → mot de passe)
const users = {};

// Pour chaque socket : socket.id → username
const onlineSockets = {};

// Pour chaque utilisateur : username → Set des socket.id actifs
const activeUsers = {};

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

function requireAuth(req, res, next) {
  if (req.session.user) next();
  else res.redirect('/');
}

app.get('/', (req, res) => {
  res.render('index', { error: null });
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || users[username]) {
    return res.render('index', { error: "Nom d'utilisateur invalide ou déjà pris." });
  }
  users[username] = password;
  req.session.user = username;
  res.redirect('/chat');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || users[username] !== password) {
    return res.render('index', { error: "Nom d'utilisateur ou mot de passe incorrect." });
  }
  req.session.user = username;
  res.redirect('/chat');
});

app.get('/chat', requireAuth, (req, res) => {
  res.render('chat', { username: req.session.user });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

io.on('connection', socket => {
  socket.on('join', username => {
    socket.username = username;
    onlineSockets[socket.id] = username;

    if (!activeUsers[username]) {
      activeUsers[username] = new Set();
    }

    const wasFirstConnection = activeUsers[username].size === 0;
    activeUsers[username].add(socket.id);

    if (wasFirstConnection) {
      io.emit('message', {
        user: 'Système',
        text: `${username} a rejoint le chat`,
      });
    }

    emitUsers();
  });

  socket.on('message', msg => {
    if (socket.username) {
      io.emit('message', { user: socket.username, text: msg });
    }
  });

  socket.on('disconnect', () => {
    const username = onlineSockets[socket.id];
    delete onlineSockets[socket.id];

    if (username && activeUsers[username]) {
      activeUsers[username].delete(socket.id);

      const wasLastConnection = activeUsers[username].size === 0;

      if (wasLastConnection) {
        delete activeUsers[username];
        io.emit('message', {
          user: 'Système',
          text: `${username} a quitté le chat`,
        });
      }

      emitUsers();
    }
  });

  function emitUsers() {
    const connectedUsernames = Object.keys(activeUsers);
    io.emit('updateUsers', connectedUsernames);
  }
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});
