const ioSocket = require('socket.io');

const io = ioSocket();
const socketAPI = {};

io.sockets.on('connection', function(socket) {
  socket.on('disconnecting', () => {
  });
});

socketAPI.io = io;

module.exports = socketAPI;
