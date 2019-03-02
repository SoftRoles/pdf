//=============================================================================
// modules
//=============================================================================
const express = require('express');
const argparse = require('argparse').ArgumentParser
const session = require('express-session');
const mongodbSessionStore = require('connect-mongodb-session')(session);
const passport = require('passport');
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const moment = require('moment')
const filesize = require("filesize")

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


//-------------------------------------
// fileupload middlewares
//-------------------------------------
app.use(require('express-fileupload')())

//=============================================================================
// test page
//=============================================================================
app.use(`/pdf/test`, express.static(path.join(__dirname, 'test')))
app.use(`/pdf/test`, express.static(path.join(__dirname, 'test/node_modules')))
app.use(`/pdf/test`, express.static(path.join(__dirname, 'test/git_repos')))

//=============================================================================
// api v1
//=============================================================================
fs.mkdir('tmp', err => { })

//-------------------------------------
// bookmarks
//-------------------------------------
app.post('/pdf/api/v1/bookmark', function (req, res) {
    let ufile = req.files.files
    let file = {
        owners: req.body.owners ? req.body.owners.split(",") : [],
        users: req.body.users ? req.body.users.split(",") : [],
        basename: ufile.name,
        name: String(Date.now()) + "-" + ufile.name,
        size: ufile.size,
        folder: req.body.folder || 'tmp',
        mdate: req.body.mdate,
        date: moment().format("YYYY/MM/DD HH:mm:ss"),
        mimetype: ufile.mimetype
    }
    const folder = req.body.save ?
        path.normalize(path.join(__dirname, "../../Datas/files", file.folder)) :
        path.join(__dirname, file.folder)
    fs.mkdir(folder, err => { })
    ufile.mv(path.join(folder, file.name), function (err) {
        if (err) res.send(err);
        if (req.body.save) {
            file.sizeStr = filesize(file.size)
            file.users.push(req.user.username)
            file.owners.push(req.user.username)
            if (file.users.indexOf("admin") === -1) { file.users.push("admin") }
            if (file.owners.indexOf("admin") === -1) { file.owners.push("admin") }
            mongodb.db("filesystem").collection("files").insertOne(file, function (err, r) {
                if (err) res.send({ error: err })
                else res.send(Object.assign({}, r.result, { insertedId: r.insertedId }, { file: file }))
            });
        }
        else {
            res.send(file)
        }
    });
});

//=============================================================================
// start service
//=============================================================================
app.listen(Number(args.port), function () {
    console.log(`Service running on http://127.0.0.1:${args.port}`)
})