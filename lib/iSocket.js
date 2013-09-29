var crypto = require (__dirname + "/cyper");
var cookie = require ("cookie");
var connect = require ("connect");

var sessionStore = new connect.session.MemoryStore();
var online_p = [];
var rooms = [];
var sockets = {};



/// we'll be explicit defining the memory session store
/// i hope it does not leak!
exports.getSessionStore = function () {
    return sessionStore;
}



/// let's get it on! --- celebrity death match
/// this is VERY STUPID! way of listening to socket connections --- we're basically going to set 'connection' listener for EVERY connection which is, yep you guessed it
/// VERY VERY STUPID and UN-EFFICIENT, but i can't seem to figure out how to access the 'request' object under a SEPARATE module/function without repeating
/// @api public
exports.io = function () {
    return {
        configure: function (io, pg_client) {
            io.set ('authorization', function (handshakeData, callback) {
                if (handshakeData.headers.cookie) {
                    // gettting our signed cookie
                    handshakeData.cookie = cookie.parse (decodeURIComponent (handshakeData.headers.cookie));

                    // when asking get to get the session i keep getting an error, so after a little 'inspecting' found out the session id key is stored
                    // in the session key concatenated with with a '.' to other stuff, so i slice it --- it works fine --- we all know what that means uh
                    sessionStore.get (handshakeData.cookie ['iMolly'].slice (2, handshakeData.cookie ['iMolly'].indexOf ('.')), function (error, session) {
                        if (error || !session) {
                            return callback (null, false);
                        }

                        else {
                            handshakeData.session = session;
                            return callback (null, true);
                        }
                    });
                }

                else {
                    return callback (null, false);
                }
            });

            io.sockets.on ('connection', function (socket) {
                // telling ERYbody your BACK --- the terminator
                io.sockets.socket (socket.id).broadcast.json.send ({success: true, mode: "ONLINE_PLUS",  user: socket.handshake.session.user.username});
                sockets [socket.handshake.session.user.username] = socket;



                // for ERY new initiate we'll be re-nitiating ALL sockets i.e. on join
                online_p.forEach (function (user) {
                    // FOLLOWINGS of user
                    if (sockets [user].handshake.session.user.following) {
                        sockets [user].handshake.session.user.following.forEach (function (following) {
                            if (online_p.indexOf (following) !== -1) {
                                sockets [user].join (following);
                            }
                        });
                    }

                    // FOLLOWERS of user
                    if (sockets [user].handshake.session.user.followers) {
                        sockets [user].handshake.session.user.followers.forEach (function (follower) {
                            if (online_p.indexOf (follower) !== -1) {
                                sockets [follower].join (user);
                            }
                        });
                    }
                });



                socket.on ("message", function (data) {
                    console.log ("mode `%s` detected", data.mode);

                    switch (data.mode) {
                        // deleting tweet --------------------------------------------------------------------------------------------------------------------------------
                        case "DELETE_TWEET":
                            console.log ("deleting tweet...");
                            // this makes sure that twitter delete request came from the OWNER
                            if (socket.handshake.session.user.username === data.tweet.by && socket.handshake.session.user !== undefined) {
                                pg_client.query ("DELETE FROM tweet WHERE id=$1", [data.tweet.id], function (error, result) {
                                    // no errors AND deleted ONLY one row --- i.e. assuming Megan Fox is watching over us!
                                    if (!error) {
                                        // responding back to the user via socket id --- only the DELETER will get this emit!
                                        io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: true, mode: data.mode, tweet: data.tweet});
                                        // broadcasting to all FOLLOWERS of delete
                                        io.sockets.in (socket.handshake.session.user.username).emit ("message", {success: true, mode: data.mode, tweet: data.tweet});

                                        // we're also be broadsiding IF the tweet deleted hash a #tag --- i.e. to the users in the conversation
                                        if (data.tweet.tweet.match (/#[a-zA-Z0-9_]+/)) {
                                            data.tweet.tweet.split (/[ \n<>="';:-]/).forEach (function (word) {
                                                if (word.match (/^#[a-zA-Z0-9_]+$/)) {
                                                    io.sockets.in (word.toLowerCase()).emit ("message", {success: true, mode: data.mode, tweet: data.tweet});
                                                }
                                            });
                                        }
                                        console.log ("tweet deleted");
                                    }

                                    else {
                                        // in the case of "error" we'll only be responding back to the user
                                        io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: false, mode: data.mode, tweet: data.tweet});
                                    }
                                }); 
                            }

                            // this is a really BAD socket --- socket connection will be closed, session cleared, online status removed!
                            // TODO: close and clear stuff!
                            else {
                                console.log ("closed connection: socket id [%s]", socket.id);
                            }
                        break;
                        // -----------------------------------------------------------------------------------------------------------------------------------------------



                        // tweet tweeted ---------------------------------------------------------------------------------------------------------------------------------
                        case "TWEET":
                            console.log ("saving tweet to database...");
                            pg_client.query ('INSERT INTO tweet (by, tweet) VALUES ($1, $2) RETURNING id, by, tweet, age(now(), "timestamp");', [socket.handshake.session.user.username, crypto.escape (data.tweet)], function (error, result) {
                                // no errors AND it returned UNO row
                                if (!error & result.rowCount === 1) {
                                    var row = result.rows[0];

                                    // now we'll be scanning the tweet for # tags --- get it! --- HASH-tags!
                                    console.log ("scanning for #...");
                                    if (row.tweet.match (/#[a-zA-Z0-9_]+/)) {
                                        row.tweet.split (/[ \n]/).forEach (function (word) {
                                            if (word.match(/^#[a-zA-Z0-9_]+$/)) {
                                                pg_client.query ('SELECT * FROM hash WHERE hash ILIKE $1', [word.slice(1)], function (error, result) {
                                                    if (!error) {
                                                        // brand new hash
                                                        if (result.rowCount === 0) {
                                                            pg_client.query ('INSERT INTO hash (hash, initiator, mention_ts[0]) VALUES ($1, $2, now()) RETURNING hash, mentions, initiator;', [word.slice(1), socket.handshake.session.user.username], function (error, result) {
                                                                if (!error)
                                                                    console.log ("#%s initiated", result.rows[0].hash);
                                                                    // telling EVERYBODY there's a new HASH
                                                                    io.sockets.emit("message", {success: true, mode: "NEW_HASH", hash: result.rows[0]});
                                                                    // well it's obvious the user should join the conversation he started
                                                                    socket.join ("#"+ result.rows[0].hash);
                                                                    // we'll keep a record of the hash the user has joined/created for the session
                                                                    // you might say we should keep of the hash id the db for persistence, my answerer to that is NO!
                                                                    // if you ain't new you're OLD, for the same reason i did not add a re-tweet function, either you come up with your own or shut the fuck up!
                                                                    socket.handshake.session.user.hashes.push (result.rows[0].hash);
                                                            });
                                                        }

                                                        // posting under a hash
                                                        else {
                                                            pg_client.query ('UPDATE hash SET mentions=$1, mention_ts[$2]=now() WHERE hash ILIKE $3 RETURNING hash, mentions, initiator;', [result.rows[0].mentions + 1, result.rows[0].mentions, result.rows[0].hash], function (error, result) {
                                                                if (!error) {
                                                                    // telling EVERYBODY there has been another mention on a hash --- this will be used to update the count on hash mentions
                                                                    io.sockets.socket (socket.id).json.send ({success: true, mode: "MENTION_PLUS", hash: result.rows[0]});
                                                                    // now, we'll be telling eryone in the conversation of this users opinion
                                                                    io.sockets.in ("#"+ result.rows[0].hash.toLowerCase()).emit ("message", {success: true, mode: "HASH_TWEET", tweet: row});
                                                                    // now we'll be checking weather or not he 'hasher' is already a "member" or not,
                                                                    // if the user is not a member, he'll join, since he mentioned the hash --- he/she/other is now in the loop
                                                                    if (socket.handshake.session.user.hashes.indexOf (result.rows[0].hash) === -1) {
                                                                        socket.join ("#"+ result.rows[0].hash.toLowerCase ());
                                                                        socket.handshake.session.user.hashes.push (result.rows[0].hash);
                                                                    }
                                                                }
                                                            });
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    }

                                    // before responding back to the user we'll be setting the owner flag to true
                                    row.owner = true;
                                    io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: true, mode: data.mode, tweet: row});

                                    // same drill, this time is false though --- shocking isn't it!
                                    row.owner = false;
                                    io.sockets.in (socket.handshake.session.user.username).emit ("message", {success: true, mode: data.mode, tweet: row});
                                }

                                else {
                                    // in the case of "error" we'll only be responding back to the user
                                    io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: false, mode: data.mode, tweet: data.tweet});
                                }
                            });
                        break;
                        // -----------------------------------------------------------------------------------------------------------------------------------------------



                        // user has requested to join a conversation -----------------------------------------------------------------------------------------------------
                        case "JOIN_HASH":
                            // joining the conversation via a click on a tweet or via iFinder
                            // the regx is to make sure the we're not injected since we're going to use it for query DIRECTLY
                            if (socket.handshake.session.user.hashes.indexOf (data.hash) === -1 && data.hash.match (/^[a-zA-Z0-9_]+$/)) {
                                // we'll be returning the latest 15 tweets which contain the hash
                                pg_client.query ("SELECT id, by, tweet, age(now(), \"timestamp\") AS age FROM tweet WHERE tweet ILIKE '%#"+ data.hash +" %' OR tweet ILIKE '%#"+ data.hash +"' ORDER BY \"timestamp\" DESC LIMIT 15;", function (error, result) {
                                    if (!error) {
                                        socket.join ("#"+ data.hash);
                                        socket.handshake.session.user.hashes.push (data.hash);
                                        io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: true, mode: data.mode, tweet: result.rows, hash: data.hash});
                                    }
                                });
                            }
                        break;
                        // -----------------------------------------------------------------------------------------------------------------------------------------------



                        // -----------------------------------------------------------------------------------------------------------------------------------------------
                        // @user mention in a tweet has been clicked or via iFinder
                        // we'll make sure the user isn't already following the user --- this should have been done on the client side, but safety first
                        // or a previous request is pending [i.e. the same --- nag-nag-nag]
                        case "SEND_FOLLOW_REQUEST":
                            // this condition confirms the user isn't following the user, or the user is trying to send a request to him/her/other self
                            // like i said before all things come in small packages --- am talking to you WHITE PPL :)
                            data.to = data.to.toLowerCase();

                            if (socket.handshake.session.user.following.indexOf (data.to) === -1 && socket.handshake.session.user.username !== data.to) {
                                pg_client.query ('SELECT * FROM request WHERE "from"=$1 AND "to"=$2 AND "type"=$3;', [socket.handshake.session.user.username, data.to, "FOLLOW"], function (error, result) {
                                    // no errors and there is no previous request [i.e. like this one]
                                    if (!error && result.rowCount == 0) {
                                        // what are we waiting for [bedsides Megan Fox], lets send the freaken request
                                        pg_client.query ('INSERT INTO request ("from", "to", "type") VALUES ($1, $2, $3) RETURNING *;', [socket.handshake.session.user.username, data.to, "FOLLOW"], function (error, result) {
                                            // all has gone well, we'll be responding back to the user
                                            if (!error) {
                                                io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: true, mode: data.mode, request: result.rows[0]});

                                                // IF the requested user is online we'll be sending him the request too --- that's where Socket.io comes handy
                                                if (online_p.indexOf (data.to) !== -1) {
                                                    io.sockets.socket (sockets[data.to].id).emit (data.to, {success: true, mode: "FOLLOW_REQUEST", request: result.rows[0]});
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        break;
                        // -----------------------------------------------------------------------------------------------------------------------------------------------
                    }
                });
            });

            console.log ("iMolly configured");
        },

        update: function (_online_p, _rooms) {
            online_p = _online_p;
            rooms = _rooms;
            console.log ("iMolly updated");
        }
    };
}
