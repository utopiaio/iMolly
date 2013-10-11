/*!
 *
 * Moe Szysalck <moe.duffdude@gmail.com>
 * 30.08.2013 13:46:29
 * iMolly
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

var http = require ("http");
var path = require ("path");
var fs = require ("fs");

var cookie = require ("cookie");
var connect = require ("connect");
var socket = require ("socket.io");
var pg = require ("pg");

// am changing it to Absolute because i don't want those annoying messages when app.js is called from a different location
var crypto = require (path.join (__dirname, "/lib/cyper"));
var qJSON = require (path.join (__dirname, "/lib/qJSON"));
var iSocket = require (path.join (__dirname, "/lib/iSocket"));

var port = process.env.PORT || 8888;
// the connection string for Heroku is given via the process env argument
var pg_connection = process.env.DATABASE_URL || "tcp://postgres:postgres@127.0.0.1:5432/imolly";
var pg_client = new pg.Client (pg_connection);
// session, set to 3 days
var sessionStore = iSocket.getSessionStore ();
var session = {
    key:    'iMolly',
    cookie: {
        maxAge:     259200000,
        secure:     false
    },
    store: sessionStore
};

// cached resources will be stored here
var cache = {};
var iJSON = {};

/// adding a couple more of MIME's on the compression list of connect...
/// @param {Object} request
/// @param {Object} response
function filter (request, response) {
    var type = response.getHeader ('Content-Type') || "";
    return type.match (/plain|image|html|css|javascript|json|pdf/);
}



// our app of connect
var app = connect();
app.use (connect.compress ({
    filter:     filter
}));
app.use (connect.favicon (path.join (__dirname, "assets/image/face-tired.png")));
app.use (connect.logger ("dev"));
app.use (connect.limit ('1mb'));
app.use (connect.query ());
app.use (connect.bodyParser ());
app.use (connect.cookieParser ('$^&*GHDW@#D$AP78|=)27tBse!23VFUZ#z!XCE~!$}*FSHI-FBDs36fg6f@{9X$}'));
app.use (connect.session (session));
app.use (connect.csrf ());
app.use (connect.errorHandler ());
app.use ("/static", connect.static (path.join (__dirname, "assets")));

app.use ("/login", login);
app.use ("/signup", signup);
app.use ("/init", init);
app.use (home);

var server = http.createServer (app).listen (port, function () {
    console.log ("Server listening @ %d", port);

    pg_client.connect (function (error) {
        // if there's an error connecting to the database server we'll be killing the whole thing!
        if (error) {
            console.error ('Dude, i was unable to connect to DB.\n', error);
            process.exit (1);
        }

        else {
            // creating our tables...
            pg_client.query ("CREATE TABLE IF NOT EXISTS users (id serial NOT NULL, username character varying(256), password character varying(256), following character varying(256)[] DEFAULT '{}'::character varying[], CONSTRAINT \"PK\" PRIMARY KEY (id), CONSTRAINT username UNIQUE (username)); CREATE TABLE IF NOT EXISTS tweet (id serial NOT NULL, by character varying(256), tweet character varying(141), \"timestamp\" timestamp without time zone DEFAULT now(), CONSTRAINT pk PRIMARY KEY (id)); CREATE TABLE IF NOT EXISTS room (id serial NOT NULL, name character varying(64), owner character varying(256), members character varying(256)[] DEFAULT '{}'::character varying[], public boolean DEFAULT true, CONSTRAINT pk_room PRIMARY KEY (id), CONSTRAINT username_fk FOREIGN KEY (owner) REFERENCES users (username) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT name UNIQUE (name)); CREATE TABLE IF NOT EXISTS hash (id serial NOT NULL, hash character varying(140), mentions integer DEFAULT 1, initiator character varying(256), mention_ts timestamp without time zone[] DEFAULT '{}'::timestamp without time zone[], CONSTRAINT pk_hash PRIMARY KEY (id), CONSTRAINT fk_initiator FOREIGN KEY (initiator) REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE NO ACTION); CREATE TABLE IF NOT EXISTS messages (id serial NOT NULL, \"to\" character varying(256), \"from\" character varying(256), \"timestamp\" timestamp without time zone DEFAULT now(), seen boolean DEFAULT false, message character varying(2048), CONSTRAINT pk_message PRIMARY KEY (id), CONSTRAINT \"from\" FOREIGN KEY (\"from\") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT \"to\" FOREIGN KEY (\"to\") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS request (id serial NOT NULL, \"from\" character varying(256), \"to\" character varying(256), type character varying(64), \"timestamp\" timestamp without time zone DEFAULT now(), CONSTRAINT pk_request PRIMARY KEY (id), CONSTRAINT from_fk FOREIGN KEY (\"from\") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT to_fk FOREIGN KEY (\"to\") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE);", function (error, result) {
                if (error) {
                    console.log (error);
                }
            });

            // am going to be defaulting on Socket.io --- no gzipping and stuff
            iSocket.io().configure (socket.listen (server), pg_client);
        }
    });
});



/// CANADA-CANADA!
function home (request, response) {
    // if we cached it already - there won't be a need to read from DISK - which we all know for being FAST!
    if (cache.body !== undefined) {
        response.setHeader ('Content-Type', 'text/html');
        response.setHeader ('Content-Length', Buffer.byteLength (cache.body + "<input type='hidden' id='csrf' name='_csrf' value='" + request.session._csrf + "' />"));
        response.end (cache.body + "<input type='hidden' id='csrf' name='_csrf' value='" + request.session._csrf + "' />");
    }

    else {
        var body = fs.readFileSync (path.join (__dirname, "/assets/page/index.html"), {
            encoding:   "utf-8",
            flag:       "r"
        });

        response.setHeader ('Content-Type', 'text/html');
        response.setHeader ('Content-Length', Buffer.byteLength (body + "<input type='hidden' id='csrf' name='_csrf' value='" + request.session._csrf + "' />"));
        response.end(body + "<input type='hidden' id='csrf' name='_csrf' value='" + request.session._csrf + "' />");
        // we'll be caching only the body --- the csrf will be unique for ERY request, well duh it's CSRF!
        cache.body = body;
    }
}



/// in Rex-Kown-Do we use the buddy system, no more flying solo, you need somebody watching your back at all times! --- and the class was about "self-defense"
function init (request, response) {
    sessionStore.get (request.sessionID, function (error, session) {
        if (!error) {
            if (crypto.logged_in (session) ) {
                // holds ERYthing to be returned to the client
                var initJSON = {
                    tweet:      {
                                    tweets:     [],
                                    following:  session.user.following,
                                    followers:  []
                                },
                    messages:   [],
                    users:      [],
                    online:     iSocket.online_p(),
                    requests:   [],
                    rooms:      [],
                    hashes:     []
                };

                // this will count how many times function 'iSerialFunc' has been called
                var FIN = 0;

                /// this is one of those moments where you want Node to be Serial --- sorry if i let you down!
                /// @param {Object} items
                /// @param {String} FLAG
                function iSerialFunc (items, FLAG) {
                    // tweets ------------------------------------------------------------------------------------------------------------------------------------------------------
                    if (FLAG === "DON_TWT") {
                        items.forEach (function (tweet) {
                            tweet.by === session.user.username ? tweet.owner = true : tweet.owner = false;
                        });

                        initJSON.tweet.tweets = items;
                    }

                    // messages ----------------------------------------------------------------------------------------------------------------------------------------------------
                    else if (FLAG === "DON_M") {
                        initJSON.messages = items;
                    }

                    // all users ---------------------------------------------------------------------------------------------------------------------------------------------------
                    else if (FLAG === "DON_USR") {
                        initJSON.users = items;
                    }

                    // following users ---------------------------------------------------------------------------------------------------------------------------------------------
                    else if (FLAG === "DON_F") {
                        items.forEach (function (follower) {
                            initJSON.tweet.followers.push (follower.username);
                        });

                        session.user.followers = initJSON.tweet.followers;
                    }

                    // request -----------------------------------------------------------------------------------------------------------------------------------------------------
                    else if (FLAG === "DON_RQ") {
                        initJSON.requests = items;
                    }

                    // rooms -------------------------------------------------------------------------------------------------------------------------------------------------------
                    else if (FLAG === "DON_RM") {
                        initJSON.rooms = items;
                    }

                    // #tags -------------------------------------------------------------------------------------------------------------------------------------------------------
                    else if (FLAG === "DON_#") {
                        initJSON.hashes = items;
                    }

                    // DON! --------------------------------------------------------------------------------------------------------------------------------------------------------
                    if (++FIN === 7) {
                        // NOW, the client can initiate socket connection, it's all good son
                        initJSON.success = true;
                        initJSON.message = "initiation DON!";
                        qJSON.qJSON (response, initJSON);
                        // we'll be updating room list on ERY-login, socket update is available too
                        iSocket.rooms (initJSON.rooms);
                    }
                }

                // tweets ----------------------------------------------------------------------------------------------------------------------------------------------------------
                // the user is following nobody! --- what an ass, right
                if (session.user.following.length === 0) {
                    pg_client.query ('SELECT id, by, tweet, age(now(), "timestamp") AS age FROM tweet WHERE "by"=$1 ORDER BY "timestamp" DESC LIMIT 50;', [session.user.username], function (error, result) {
                        !error ? iSerialFunc (result.rows, "DON_TWT") : iSerialFunc ([], "DON_TWT");
                    });
                }

                else {
                    var ifollowing = JSON.stringify (session.user.following);
                    // preparing for SQL --- SQL-ing is not my thing --- in my defense Django's AWESOME ORM Ruined Me!
                    ifollowing = ifollowing.replace (/"/g, "'");

                    pg_client.query ('SELECT id, by, tweet, age(now(), "timestamp") AS age FROM tweet WHERE ((by IN (' + ifollowing.slice (1, -1) + ')) OR (by=$1)) ORDER BY timestamp DESC LIMIT 50;', [session.user.username], function (error, result) {
                        !error ? iSerialFunc (result.rows, "DON_TWT") : iSerialFunc ([], "DON_TWT");
                    });
                }

                // ALL users -----------------------------------------------------------------------------------------------------------------------------------------------------
                pg_client.query ("SELECT username FROM users;", function (error, result) {
                    !error ? iSerialFunc (result.rows, "DON_USR") : iSerialFunc ([], "DON_USR");
                });

                // Following users -----------------------------------------------------------------------------------------------------------------------------------------------
                pg_client.query ("SELECT username FROM users WHERE $1 = ANY (following);", [session.user.username], function (error, result) {
                    !error ? iSerialFunc (result.rows, "DON_F") : iSerialFunc ([], "DON_F");
                });

                // messages to and from the user ---------------------------------------------------------------------------------------------------------------------------------
                pg_client.query ('SELECT * FROM messages WHERE "to"=$1 OR "from"=$1 ORDER BY "timestamp" DESC;', [session.user.username], function (error, result) {
                    !error ? iSerialFunc (result.rows, "DON_M") : iSerialFunc ([], "DON_M");
                });

                // requests ------------------------------------------------------------------------------------------------------------------------------------------------------
                // NOTE: once accepted / declined it's DELETED! 10K rows son!
                pg_client.query ('SELECT * FROM request WHERE "to"=$1 ORDER BY "timestamp" DESC;', [session.user.username], function (error, result) {
                    !error ? iSerialFunc (result.rows, "DON_RQ") : iSerialFunc ([], "DON_RQ");
                });

                // ALL the rooms -------------------------------------------------------------------------------------------------------------------------------------------------
                pg_client.query ('SELECT * FROM room ORDER BY name ASC;', function (error, result) {
                    !error ? iSerialFunc (result.rows, "DON_RM") : iSerialFunc ([], "DON_RM");
                });

                // ALL #tags -----------------------------------------------------------------------------------------------------------------------------------------------------
                pg_client.query ('SELECT hash, mentions, initiator FROM hash ORDER BY mentions DESC;', function (error, result) {
                    !error ? iSerialFunc (result.rows, "DON_#") : iSerialFunc ([], "DON_#");
                });
            }

            // we won't be setting the status code to 403 since we want to redirect to home page
            else {
                qJSON.qJSON (response, {
                    success:    false,
                    code:       "MANEW",
                    message:    "ማነው  ሚለየው  ሚለየው..."
                });
            }
        }
    });
}



/// USA-USA-USA
function login (request, response) {
    // FIX: clean slate login procedure
    // yep, all things are in small cases...
    request.body.username = request.body.username.toLowerCase();

    // salva --- wait your turn son --- the other dude is logged in with your shit
    // user trying to login is already logged in --- we'll figure out weather or not he/she/other is trying to login from a different location or the same agent
    if (iSocket.online_p().indexOf (request.body.username) !== -1) {
        // same user same browser --- code JOEY
        // i've TRIED to block all known loop-holes
        if (request.session.user !== undefined && request.session.user.username === request.body.username) {
            iJSON = {
                success:    true,
                code:       "JOEY",
                message:    "Mitch, you were already logged in"
            };
        }

        // son, you have been compromised --- damn NSA
        else {
            iJSON = {
                success:    false,
                code:       "NSA",
                message:    "Son, you've been compromised.</br><strong>ABORT!</strong>&nbsp;<strong>ABORT!</strong>"
            };
        }

        qJSON.qJSON (response, iJSON);
    }

    // clean slate...
    else if (request.body.password.length > 5 && request.session.user === undefined) {
        // two factor authorization my ass!
        pg_client.query ("SELECT * FROM users WHERE username=$1 AND password=$2;", [request.body.username, crypto.sha512 (request.body.password)], function (error, result) {
            if (error) {
                iJSON = {
                    success:    false,
                    code:       "DB_ERROR",
                    message:    "Something HORRIBLE went wrong :("
                };
            }

            else {
                // no surprises here! --- yes ONLY one row must be returned
                if (result.rowCount === 1) {
                    iJSON = {
                        success:    true,
                        code:       "WHITE_MAN",
                        message:    "Werr'up <strong>" + request.body.username + "</strong>"
                    };

                    // storing credentials in session `user`
                    request.session.user = {
                        id:         result.rows[0].id,
                        username:   result.rows[0].username,
                        following:  result.rows[0].following,
                        followers:  [],
                        hashes:     []
                    };
                }

                // BIG surprise here! --- we probably got injected....funny - "injected" --- or simply Username and password did not match
                else {
                    iJSON = {
                        success:    false,
                        code:       "NOT_COOL",
                        message:    "you're FAT!"
                    };
                }
            }

            qJSON.qJSON (response, iJSON);
        });
    }

    // someone is logged in...
    else if (request.session.user.username !== undefined) {
        iJSON = {
            success:    false,
            code:       "DOUBLE_DIP",
            message:    "`Someone` is already logged in"
        };

        qJSON.qJSON (response, iJSON);
    }



    // straight up --- you ain't legit
    else {
        iJSON = {
            success:    false,
            code:       "DED",
            message:    "Canada!-Canada!-Canada!"
        };

        qJSON.qJSON (response, iJSON);
    }
}



/// i wonder what this does...
function signup (request, response) {
    var iJSON = {};

    if (request.body.password.length > 5 && request.body.username.match (/^[a-zA-Z0-9_]+$/)) {
        request.body.username = request.body.username.toLowerCase();

        pg_client.query ("INSERT INTO users (username, password) VALUES ($1, $2);", [request.body.username, crypto.sha512 (request.body.password)], function (error, result) {
            if (error) {
                iJSON = {
                    success:    false,
                    code:       "USERNAME_NA",
                    message:    "Username <strong>" + request.body.username + "</strong> already exits"
                };
            }

            else {
                iJSON = {
                    success:    true,
                    code:       "NEW_IS_COOL",
                    message:    "U.S. of Aye! <strong>" + request.body.username + "</strong>"
                };
            }

            qJSON.qJSON (response, iJSON);
        });
    }

    else {
        iJSON = {
            success:    false,
            code:       "DEBRA", // K.H
            message:    "Username did not match /^[a-zA-Z0-9_]+$/"
        };

        qJSON.qJSON (response, iJSON);
    }
}

