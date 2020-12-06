const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const redis = require('redis');
const app = express();
const socketAPI = require('../bin/socketConnector')
const redisClient = redis.createClient()

redisClient.on('message', function (channel, message) {
  if (channel === 'events') {
    socketAPI.io.emit('event', JSON.parse(message));
  }
});

redisClient.subscribe('events')

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(passport.initialize());

app.get('/', (req, res, next) => {
  res.json({ status: 'Ok' })
});


app.use(function(req, res, next) {
  next({ status: 404, message: 'Not Found' });
});

app.use(function(err, req, res, next) {

  res.status(err.status || 500);
  res.send(err.message);
});

module.exports = app;
