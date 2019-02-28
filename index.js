//=============================================================================
// modules
//=============================================================================
const express = require('express');
const argparse = require('argparse').ArgumentParser
const session = require('express-session');
const mongodbSessionStore = require('connect-mongodb-session')(session);
const passport = require('passport');
const assert = require('assert')
const os = require('os')
const path = require('path')

//-------------------------------------
// arguments
//-------------------------------------
const argParser = new argparse({
    addHelp: true,
    description: 'PDF scrapping and manipulation service'
})
argParser.addArgument(['-p', '--port'], { help: 'Listening port', defaultValue: '3011' })
const args = argParser.parseArgs()

//-------------------------------------
// mongodb
//-------------------------------------
let mongodb;
const mongoClient = require("mongodb").MongoClient
const mongodbUrl = "mongodb://127.0.0.1:27017"
mongoClient.connect(mongodbUrl, { poolSize: 10, useNewUrlParser: true }, function (err, client) {
    assert.equal(null, err);
    mongodb = client;
});

//=============================================================================
// http server
//=============================================================================
const app = express();

//-------------------------------------
// session store
//-------------------------------------
var store = new mongodbSessionStore({
    uri: mongodbUrl,
    databaseName: 'auth',
    collection: 'sessions'
});

// Catch errors
store.on('error', function (error) {
    assert.ifError(error);
    assert.ok(false);
});

var sessionOptions = {
    secret: 'This is a secret',
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    },
    store: store,
    resave: true,
    saveUninitialized: true
}

app.use(session(sessionOptions));

//-------------------------------------
// authentication
//-------------------------------------
passport.serializeUser(function (user, cb) {
    cb(null, user.username);
});

passport.deserializeUser(function (username, cb) {
    mongodb.db("auth").collection("users").findOne({ username: username }, function (err, user) {
        if (err) return cb(err)
        if (!user) { return cb(null, false); }
        return cb(null, user);
    });
});

app.use(passport.initialize());
app.use(passport.session());

app.use(require('@softroles/authorize-bearer-token')(function (token, cb) {
    mongodb.db("auth").collection("users").findOne({ token: token }, function (err, user) {
        if (err) return cb(err)
        if (!user) { return cb(null, false); }
        return cb(null, user);
    });
}))

app.use(require('@softroles/authorize-local-user')({ username: 'local' }))

//-------------------------------------
// common middlewares
//-------------------------------------
app.use(require('morgan')('tiny'));
app.use(require('body-parser').json())
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require("cors")())

//=============================================================================
// test page
//=============================================================================
app.use(`/pdf/test`, express.static(path.join(__dirname, 'test')))
app.use(`/pdf/test`, express.static(path.join(__dirname, 'test/node_modules')))
app.use(`/pdf/test`, express.static(path.join(__dirname, 'test/git_repos')))

//=============================================================================
// start service
//=============================================================================
app.listen(Number(args.port), function () {
    console.log(`Service running on http://127.0.0.1:${args.port}`)
})