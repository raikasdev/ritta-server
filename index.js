// NPMJS Modules
const express = require("express"),
      session = require("express-session"),
      fileStore = require("session-file-store")(session),
      bodyParser = require("body-parser"),
      https = require("https"),
      fs = require("fs"),
      crypto = require("crypto"),
      rateLimit = require("express-rate-limit"),
      jwt = require("jwt-decode");

// Local modules
let database

// Remove the useless part of argv
process.argv = process.argv.slice(2);


// Debug mode
const debugMode = process.argv.includes("debug")

// Custom console.log
console.log = function(d = "") {
  process.stdout.write("Ritta » " + d + '\n');
}
console.debug = function(d = "") {
  if(debugMode) process.stdout.write("Debug » " + d + '\n');
}

// Enabled message
if(debugMode) {
  console.debug("Debug mode enabled")
}

// Events

process.on('exit', function(code) {
  return console.log(`Ritta stopping with exit code ${code}`);
});

process.on('SIGINT', function() {
    console.log("Control-C detected. Stopping");
    server.close();
    process.exit();
});

// Custom redirect using js, because the express one breaks things
function redirect(res, url) {
  res.send('<script>window.location.replace("'+url+'");</script>')
}
// Start

let config;
try {
  config = require("./config.json")
} catch(e) {
  console.log("Config file not found. Rename config.json.example to config.json")
  process.exit()
}
let lang;
try {
  lang = require(config.langFile)
} catch(e) {
  console.log("Lang file not found. Check your config.")
  process.exit()
}
try {
  database = require("./database/"+config.databaseType+".js")
} catch(e) {
  console.debug(e)
  console.log("Database file not found. Check your config.")
  process.exit()
}
const utils = require("./utils.js")
const packageJSON = require("./package.json")

// Opinsys
const opinsys = config.opinsys.enabled;
const opinsys_organization = config.opinsys.organization;
const opinsys_redirect = config.opinsys.redirectURI;

/*
 *
 * WEB
 *
 */
const app = express();

app.set('trust proxy', 1)
app.set('view engine', 'ejs');

app.use(session({
  genid: function(req) {
    return utils.genUUID()
  },
  secret: config.encryptionKey,
  store: new fileStore({logFn: function() {}}),
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 3600000, secure: false, test:"true" }
}))
const rateLimitThese = [/\/api\/calendar\/(.+)/]
const limiter = rateLimit({
  windowMs: 15000,
  max: 1,
  handler: function (req, res, next) {
    if(rateLimitThese.some((limit)=>{console.log(req.originalUrl.match(rateLimitThese)); return req.originalUrl.match(rateLimitThese)})) {
      res.status(429).send("<h2>You are being rate limited.</h2><script>window.location.replace('/');</script>");
      return;
    }
    next();
  },
});
app.use(limiter)
app.use(function (req, res, next) {
  console.debug(`${req.originalUrl} pinged`)
  next()
})
app.use(bodyParser.urlencoded({extended: true}))
app.use(express.static("assets"))

app.get("/", (req, res) => {
  if(utils.isLoggedIn(req)) {
    res.render(__dirname + "/web/homepage.ejs", {version: packageJSON.version, lang: lang, school: config.school, username: utils.usernameFromToken(req), user: database.getUserData(utils.usernameFromToken(req))})
  } else {
    redirect(res,"/account/login")
  }
  //res.send("Redirect -> /login")
})

app.get("/account/:action", (req,res)=>{
  switch(req.params.action.toLowerCase()) {
    case 'login':
      if(req.session.account) {
        if(database.isLoggedInByToken(req.session.account.token)) {
          //res.send("is logged in <3")
          console.debug("User is logged in, redirect")
          redirect(res,"/")
          return;
        } else {
          utils.setAccount(req, undefined)
        }
      }
      let error;
      if(req.query.hasOwnProperty("invalid")) {
        error = lang.error_login;
      } else if(req.query.hasOwnProperty("loggedout")){
        error = lang.loggedout;
      } else if(req.query.hasOwnProperty("opinsysaccountnone")){
        error = lang.opinsys_account_none;
      } else if(req.query.hasOwnProperty("opinsysinvalidorganization")){
        error = lang.opinsys_organization_invalid;
      }
      res.render(__dirname + "/web/loginpage.ejs", {lang: lang, school: config.school, opinsys: config.opinsys, error: error})
      break;
    case 'logout':
      console.debug("logout page")
      utils.setAccount(req, undefined)
      console.debug("Log out succesfull, redirect")
      redirect(res,"/account/login?loggedout")
      break;
    case 'changepassword':
      res.send({success: database.setPassword("raikas","salasaana","raikasonparas")})
      break;
    case 'create':
      res.json(database.newAccount(req.query.username, req.query.password))
      break;
    case 'loggedin':
      redirect(res, "../../")
      break;
    case 'opinsys':
      if(!req.query.jwt) {
        redirect(res, "/account/login?opinsysaccountnone")
        return;
      }
      const data = jwt(req.query.jwt);

      if(!data.username) {
        redirect(res, "/account/login?opinsysaccountnone")
        return;
      }
      if(data.organisation_domain !== opinsys_organization) {
        redirect(res, "/account/login?opinsysinvalidorganization")
        return;
      }
      
      if(!database.validateUsername(data.username)) {
        redirect(res, "/account/login?opinsysaccountnone")
        return;
      }
      utils.setAccount(req, {token: database.opinsysToken(data.username)})
      redirect(res, "/account/loggedin") 
      break;
    default:
      res.status(404).send("Not found GET /account/:action")
      break;
  }
})
app.post("/account/:action", (req,res)=>{
  switch(req.params.action.toLowerCase()) {
    case 'process':
      if(database.validate(req.body.username, req.body.password)) {
        utils.setAccount(req, {token: database.generateAccountToken(req.body.username, req.body.password)})
        redirect(res, "/account/loggedin")
      } else {
        redirect(res, "/account/login?invalid")
      }
      break;
    default:
      res.status(404).send("Not found POST /account/:action")
      break;
  }
})
app.post("/api/:action", (req,res)=>{
  switch(req.params.action.toLowerCase()) {
    case 'process':
      if(database.validate(req.body.username, req.body.password)) {
        utils.setAccount(req, {token: database.generateAccountToken(req.body.username, req.body.password)})
        redirect(res, "/account/loggedin")
      } else {
        redirect(res, "/account/login?invalid")
      }
      break;
    default:
      res.status(404).send("Not found POST /account/:action")
      break;
  }
})
app.get("/api/calendar/:userid", (req,res)=>{
  req.rateLimitThis = true;
  let value = utils.createCalendar([{
    title: 'Saksa',
    start: [2020, 10, 12, 22, 15],
    duration: { minutes: 45 }
  },
  {
    title: 'Englanti',
    start: [2020, 10, 12, 21, 15],
    duration: { minutes: 45 }
  }])
  if(!value) {
    res.send("Error")
    return;
  }
  let id = crypto.randomBytes(20).toString('hex').substring(0, 4);
  fs.writeFileSync(`${__dirname}/${id}.ics`, value)
  res.sendFile(`${__dirname}/${id}.ics`, {}, function (err) {
    if (err) {
      next(err)
    } else {
      console.debug(`${id}.ics was sent`)
      try {
        fs.unlinkSync(`${__dirname}/${id}.ics`)
        console.debug(`File ${id}.ics removed`)
      } catch(err) {
        console.debug(err)
      }
    }
  })

})
let server;
if(config.ssl.enabled) {
  var privateKey = fs.readFileSync( config.ssl.key );
  var certificate = fs.readFileSync( config.ssl.cert );

  server = https.createServer({
      key: privateKey,
      cert: certificate
  }, app).listen(config.website.port, function() {
    console.log("Website is now running on port " + config.website.port)
  });
} else {
  server = app.listen(config.website.port, function() {
    console.log("Website is now running on port " + config.website.port)
  })
}
