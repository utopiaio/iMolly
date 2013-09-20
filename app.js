/*!
 * 
 * Moe Szysalck <moe.duffdude@gmail.com>
 * 30.08.2013 13:46:29
 * iChat
 * a small and EXCLUSIVE app, built with the AMAZING Nodejs, Angular.js and Bootstrap 3.0
 * 
 * on a personal note: in the name of the Holly Spirit, AMEN! --- you know am taking abooout --- Megan Fox 14!
 * 
 * let's get it on!
 * i be right back...
 * am BACK --- after a day!
 * 
 * NOTE:
 * i will not be using 'cluster' since i can't afford it!
 * you know i like to live on the edge son, but 751 Dyno hours is all i have!
 * 
 */

var https = require ("https");
var path = require ("path");
var fs = require ("fs");

var connect = require ("connect");
var socket = require ("socket.io");
var pg = require ("pg");

var crypto = require("./lib/cyper");
var qJSON = require("./lib/qJSON");
var iSocket = require("./lib/iSocket");

// this will be assigned once our server is up and running --- socket io will be piggyback ridding on the server
var io = null;
var port = process.env.PORT || 8888;
// the connection string for Heroku is given via the process env argument
var pg_connection = process.env.DATABASE_URL || "tcp://postgres:postgres@127.0.0.1:5432/ichat";
var pg_client = new pg.Client (pg_connection);
pg_client.connect (function (err) {
    // if there's an error connecting to the database server we'll be killing the whole thing!
    if (err) {
        console.error('Dude, i was unable to connect to Postgres', err);
        process.exit(1);
    }
});
// this options will be used for HTTPS --- yep, we're only allowing the NSA access without authorization!
var options = {
    key: fs.readFileSync ("./lib/https/private.pem"),
    cert: fs.readFileSync ("./lib/https/public.pem")
};
// the variable name says it all --- it's a freaken session!
var session = {
    key: 'iMolly',
    cookie: { maxAge: 1800000, secure: true }
};
// cached resources will be stored here
var cache = {};
// associates a socket with a user --- so we'll know who disconnected and stuff...
var sockets = {};
// this will associates Username with a socket instance
var online = {};
// list of Username of users who are on-line --- it'll be returned to the "public"
var online_p = [];

/// adding a couple more of MIME's on the compression list of connect...
/// @param {Object} request
/// @param {Object} response
/// @return {Boolean}
function filter (request, response) {
    var type = response.getHeader ('Content-Type') || "";
    return type.match(/plain|image|html|css|javascript|json|pdf/);
}

// our app of connect
var app = connect();
app.use (connect.compress({filter: filter}));
app.use (connect.favicon (path.join (__dirname, "assets/image/face-tired.png")));
app.use (connect.logger ("dev"));
app.use (connect.limit('1mb'));
app.use (connect.query());
app.use (connect.bodyParser());
app.use (connect.cookieParser('$^&*GHDW@#D$AP78|=)27tBse!23VFUZ#z!XCE~!$}*FSHI-FBDs36fg6f@{9X$}'));
app.use (connect.session(session));
app.use (connect.csrf());
app.use (connect.errorHandler());
app.use ("/static", connect.static("assets"));

app.use ("/login", login);
app.use ("/signup", signup);
app.use ("/init", init);
app.use (home);

var server = https.createServer (options, app).listen (port, function () {
    console.log ("Server listening @ %d", port);
    io = socket.listen (server);
});



function home (request, response) {
    // if we cached it already - there won't be a need to read from DISK - which we all know for it being FAST!
    if (cache.body) {
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Content-Length', Buffer.byteLength(cache.body + "<input type='hidden' id='csrf' name='_csrf' value='"+ request.session._csrf +"' />"));
        response.end (cache.body + "<input type='hidden' id='csrf' name='_csrf' value='"+ request.session._csrf +"' />");
    }

    else {
        var body = fs.readFileSync ("./assets/page/index.html", {encoding: "utf-8", flag: "r"});

        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Content-Length', Buffer.byteLength(body + "<input type='hidden' id='csrf' name='_csrf' value='"+ request.session._csrf +"' />"));
        response.end (body + "<input type='hidden' id='csrf' name='_csrf' value='"+ request.session._csrf +"' />");
        // we'll be caching only the body --- the csrf will be unique for ERY request, well duh it's CSRF!
        cache.body = body;
    }
}



function init (request, response) {
    // making sure this is a legit request...
    if (crypto.logged_in (request)) {
        // holds ERYthing to be returned to the client
        var initJSON = {};

        // the variable names spell out for what they are going to be used for
        var users = [];
        var tweets = [];
        var followers = [];
        var messages = [];
        var requests = [];
        var rooms = [];

        // this will count how many times function 'iSerialFunc' has been called
        var FIN = 0;

        /// this is one of those moments where you want Node to be Serial --- sorry if i let you down!
        /// after being called n times it'll end the response --- that n is 6, counted using 'FIN' --- that's 'The End' in French if you didn't know...
        /// @param {Object} items
        /// @param {String} FLAG
        function iSerialFunc (items, FLAG) {
            // tweets ----------------------------------------------------------------------------------------------------------------------------------------------------
            if (FLAG == "DON_TWT") {
                tweets = items;

                tweets.forEach (function (tweet, index) {
                    tweet.by == request.session.user.username ? tweet.owner = true : tweet.owner = false;
                });
            }

             // messages -------------------------------------------------------------------------------------------------------------------------------------------------
            else if (FLAG == "DON_M") {
                messages = items;
            }

            // all users -------------------------------------------------------------------------------------------------------------------------------------------------
            else if (FLAG == "DON_USR") {
                users = items;
            }

            // following users -------------------------------------------------------------------------------------------------------------------------------------------
            else if (FLAG == "DON_F") {
                items.forEach (function (follower) {
                    followers.push (follower.username);
                });
                // now, it'll be really hard to "inject" followers from the client side --- muuuuuuuuhahahahahahaha --- that was my evil laugh
                request.session.user.followers = followers;
            }

            // request ---------------------------------------------------------------------------------------------------------------------------------------------------
            else if (FLAG == "DON_RQ") {
                requests = items;
            }

            // rooms -----------------------------------------------------------------------------------------------------------------------------------------------------
            else if (FLAG == "DON_RM") {
                rooms = items;
            }

            // yep, we're counting...like that Vampire that counts Mr. Count, i think his name is
            FIN ++;

            // DON! ------------------------------------------------------------------------------------------------------------------------------------------------------
            if (FIN == 6) {
                initJSON.tweet = {
                    tweets:     tweets,
                    following:  request.session.user.following,
                    followers:  followers
                };

                initJSON.messages = messages;
                initJSON.requests = requests;
                initJSON.rooms = rooms;
                initJSON.users = users;
                initJSON.online = online_p;

                initJSON.success = true;
                initJSON.message = "initiation DON!";

                qJSON.qJSON (response, initJSON);

                // initiating socket connection
                // initially named 'on connection' argument 'socket' & that got me in to a heap of trouble! [get it - heap] --- that's why it's named 'socket_'
                io.sockets.on ("connection", function (socket_) {
                    if (!request.session.user.initiated) {
                        sockets[socket_.id] = socket_;
                        request.session.user.socket = socket_.id;
                        online[request.session.user.username] = request.session.user;
                        iSocket.intiate (request, io, pg_client, online, rooms, online_p, sockets);
                        request.session.user.initiated = true;
                    }
                });
            }
        }

        // tweets --------------------------------------------------------------------------------------------------------------------------------------------------------
        // we'll be getting the 'following' list from the session, so there's little chance for it to be tampered with
        var ifollowing = JSON.stringify (request.session.user.following);
        // preparing for SQL --- SQL-ing is not my thing --- in my defense Django's AWESOME ORM Ruined Me!
        while (ifollowing.match (/"/)) {
            ifollowing = ifollowing.replace ('"', "'");
        }

        // if the user isn't following anybody --- the query will fail, so we'll be doing a minor modification!
        ifollowing = ifollowing.toString() == "null" ? "['']" : ifollowing;

        pg_client.query ('SELECT id, by, tweet, age(now(), "timestamp") AS age FROM tweet WHERE ((by IN ('+ ifollowing.slice(1, -1) +')) OR (by=$1)) ORDER BY timestamp DESC LIMIT 50;', [request.session.user.username], function (error, result) {
            !error ? iSerialFunc (result.rows, "DON_TWT") : iSerialFunc ([], "DON_TWT");
        });

        // ALL users -----------------------------------------------------------------------------------------------------------------------------------------------------
        pg_client.query ("SELECT username FROM users;", function (error, result) {
            !error ? iSerialFunc (result.rows, "DON_USR") : iSerialFunc ([], "DON_USR");
        });


        // Following users -----------------------------------------------------------------------------------------------------------------------------------------------
        pg_client.query ("SELECT username FROM users WHERE $1 = ANY (following);", [request.session.user.username], function (error, result) {
            !error ? iSerialFunc (result.rows, "DON_F") : iSerialFunc ([], "DON_F");
        });


        // messages to and from the user ---------------------------------------------------------------------------------------------------------------------------------
        pg_client.query ('SELECT * FROM messages WHERE "to"=$1 OR "from"=$1 ORDER BY "timestamp" DESC;', [request.session.user.username], function (error, result) {
            !error ? iSerialFunc (result.rows, "DON_M") : iSerialFunc ([], "DON_M");
        });


        // requests, NOTE: once accepted / declined it's DELETED! 10K rows son! ------------------------------------------------------------------------------------------
        pg_client.query ('SELECT * FROM request WHERE "to"=$1;', [request.session.user.username], function (error, result) {
            !error ? iSerialFunc (result.rows, "DON_RQ") : iSerialFunc ([], "DON_RQ");
        });


        // ALL the rooms -------------------------------------------------------------------------------------------------------------------------------------------------
        pg_client.query ('SELECT * FROM room ORDER BY name ASC;', function (error, result) {
            !error ? iSerialFunc (result.rows, "DON_RM") : iSerialFunc ([], "DON_RM");
        });
    }

    // we won't be setting the status code to 403 since we want to redirect to home page
    else {
        qJSON.qJSON (response, {success: false, message: "Manew-Meleyew-Meleyew..."});
    }
}



function login (request, response, next) {
    var iJSON = {};

    // clean slate...
    if (request.body.password.length > 5 && request.session.user == undefined) {
        request.body.username = request.body.username.toLowerCase();

        pg_client.query ("SELECT * FROM users WHERE username=$1 AND password=$2;", [request.body.username, crypto.sha512 (request.body.password)], function (error, result) {
            if (error) {
                iJSON.success = false;
                iJSON.code = "DB_ERROR";
                iJSON.message = "Something HORRIBLE went wrong :(";
            }

            else {
                // no surprises here! --- yes ONLY one row must be returned
                if (result.rowCount == 1) {
                    iJSON.success = true;
                    iJSON.code = "WHITE_MAN";
                    iJSON.message = "Werr'up <strong>"+ request.body.username +"</strong>";

                    // storing credentials in session `user`
                    request.session.user = {
                        id:         result.rows[0].id,
                        username:   result.rows[0].username,
                        following:  result.rows[0].following,
                        followers:  [],
                        hashes:     [],
                        socket:     null,
                        initiated:  false
                    };

                    // this constitutes as a weired activity
                    if (online_p.indexOf (request.body.username) == -1) {
                        online_p.push (request.body.username);
                    }
                }

                // BIG surprise here! --- we probably got injected....funny - "injected" --- or simply Username and password did not match
                else {
                    iJSON.success = false;
                    iJSON.code = "NOT_COOL";
                    iJSON.message = "you ain't legit!";
                }
            }

            qJSON.qJSON (response, iJSON);
        });
    }

    // user is already logged in --- but somehow forgot! --- that's not a surprise / or DOUBLE DIP
    // someone is "logged in"
    else if (request.session.user.username != undefined) {
        // JOEY - the same person is trying to login AGAIN - which is cool - though...
        if (request.session.user.username == request.body.username) {
            iJSON.success = true;
            iJSON.code = "JOEY";
            iJSON.message = "you were already logged in";
        }

        // DOUBLE dip on session! --- i would like to Double Dip Megan Fox 14!
        else {
            iJSON.success = false;
            iJSON.code = "DOUBLE_DIP";
            iJSON.message = "'someone' is already logged in here!";
        }

        qJSON.qJSON (response, iJSON);
    }

    // straight up -- you ain't legit! --- Wu-Tang Clan - Windmill - 8 Diagrams
    else {
        iJSON.success = false;
        iJSON.message = "You ain't legit son!";
        qJSON.qJSON (response, iJSON);
    }
}



function signup (request, response) {
    var iJSON = {};

    if (request.body.password.length > 5) {
        request.body.username = request.body.username.toLowerCase();

        pg_client.query ("INSERT INTO users (username, password) VALUES ($1, $2);", [request.body.username, crypto.sha512 (request.body.password)], function (error, result) {
            if (error) {
                iJSON.success = false;
                iJSON.message = "Username <strong>"+ request.body.username +"</strong> already exits.";
            }

            else {
                iJSON.success = true;
                iJSON.message = "You're in! <strong>"+ request.body.username +"</strong>";
            }

            qJSON.qJSON (response, iJSON);
        });
    }

    else {
        iJSON.success = false;
        iJSON.message = "Minimum password length is 6.";
        qJSON.qJSON (response, iJSON);
    }
}

