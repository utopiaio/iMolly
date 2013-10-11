var crypto = require (__dirname + "/cyper");
var cookie = require ("cookie");
var connect = require ("connect");
var sessionStore = new connect.session.MemoryStore();

var online_p = [];
var rooms = [];
var sockets = {};


/// yep, another bug fixed via 'Sharing' --- USA!-USA!-USA!-USA!-USA!
exports.getSessionStore = function () {
    return sessionStore;
}



/// ABORT! bug fix --- via 'sharing'
/// now, the online count is -1 [you iz excluded from the list]
/// and also, when the last user logs-out iMolly will not crash
exports.online_p = function () {
    return online_p;
}



/// setting our rooms --- i don't know why am doing this be --- i am...
/// will i regret it --- we'll find out...
exports.rooms = function (iRooms) {
    rooms = iRooms;
}



/// let's get it on! --- celebrity death match
/// @api public
exports.io = function () {
    return {
        configure: function (io, pg_client) {
            io.set ('browser client', false);
            io.set ('authorization', function (handshakeData, callback) {
                if (handshakeData.headers.cookie) {
                    handshakeData.cookie = cookie.parse (decodeURIComponent (handshakeData.headers.cookie));

                    // when asking get to get the session i keep getting an error, so after a little 'inspecting' found out the session id key is stored
                    // in the session (shocking, i know), the key is concatenated with with a '.' to other stuff, so i slice it --- 'it works fine' --- we all know what that means uh
                    sessionStore.get (handshakeData.cookie ['iMolly'].slice (2, handshakeData.cookie ['iMolly'].indexOf ('.')), function (error, session) {
                        if (error || !session) {
                            return callback (null, false);
                        }

                        else {
                            handshakeData.session = session;
                            handshakeData.session.id = handshakeData.cookie ['iMolly'].slice (2, handshakeData.cookie ['iMolly'].indexOf ('.'));
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
                online_p.push (socket.handshake.session.user.username);

                // for ERY new initiate we'll be re-nitiating ALL sockets i.e. on join
                online_p.forEach (function (user) {
                    
                    if (sockets [user] !== undefined) {
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



                        // ACCEPTING REQUEST -----------------------------------------------------------------------------------------------------------------------------
                        case "ACCEPT_REQUEST":
                            // making sure this is a legit request...
                            // this condition makes sure the request is being accepted by the user intended to accept it, ya'll feel me!
                            if (data.request.to === socket.handshake.session.user.username) {
                                // uno:     'FOLLOW' tweet
                                // dos:     'UN-FOLLOW' tweet
                                // tress:   'JOIN' room
                                // quatro:  'LEAVE' room
                                // phew, i don't know what comes after quatro
                                console.log ("[%s] detected...", data.request.type);

                                // requester is offline, we'll be fetching the data from db
                                // oh FYI you're going to be seeing the same code being copy-pasted TWICE --- there're another thing i ALWAYS do twice ;)
                                if (sockets [data.request.from] === undefined) {
                                    pg_client.query ("SELECT * FROM users WHERE username=$1", [data.request.from], function (error, result) {
                                        if (!error) {
                                            pg_client.query ("UPDATE users SET following[$1]=$2 WHERE username=$3 RETURNING id, username, following;", [(result.rows[0].following.length + 1), data.request.to, data.request.from], function (error, result) {
                                                if (!error) {
                                                    // we'll be responding back to the accepter via "ACCEPT_REQUEST"
                                                    io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: true, mode: data.mode, from: data.request.from, index: data.index});

                                                    // now we'll be deleting the request from db --- 10,000 son
                                                    pg_client.query ("DELETE FROM request WHERE id=$1;", [data.request.id], function (error) {
                                                        if (error) {
                                                            console.log (error);
                                                        }
                                                    });
                                                }

                                                else {
                                                    console.log (error);
                                                }
                                            });
                                        }
                                    });
                                }

                                // requester is online --- LUUUUUUUUUUUUUUUUUCKY
                                else {
                                    pg_client.query ("UPDATE users SET following[$1]=$2 WHERE username=$3 RETURNING id, username, following;", [(sockets [data.request.from].handshake.session.user.following.length + 1), data.request.to, data.request.from], function (error, result) {
                                        if (!error) {
                                            // we'll be responding back to the accepter via "ACCEPT_REQUEST"
                                            io.sockets.socket (socket.id).emit (socket.handshake.session.user.username, {success: true, mode: data.mode, from: data.request.from, index: data.index});

                                            // updating following list on the session
                                            sockets [data.request.from].handshake.session.user.following = result.rows[0].following;
                                            // joining user --- i.e. 'tweet' room
                                            sockets [data.request.from].join (data.request.to);
                                            // telling the requester the good news
                                            io.sockets.socket (sockets [data.request.from].id).emit (data.request.from, {success: true, mode: "REQUEST_ACCEPTED", following: result.rows[0].following, acceptor: data.request.to});

                                            // now we'll be deleting the request from db --- 10,000 son
                                            pg_client.query ("DELETE FROM request WHERE id=$1;", [data.request.id], function (error) {
                                                if (error) {
                                                    console.log (error);
                                                }
                                            });
                                        }

                                        else {
                                            console.log (error);
                                        }
                                    });

                                    sockets [data.request.from].handshake.session.user.following;
                                }

                                
                            }
                        break;
                        // -----------------------------------------------------------------------------------------------------------------------------------------------
                    }
                });



                // on 'Refresh' disconnect is trigged --- so neega watch your self --- DO NOT REFRESH --- Socket.io will handle the breaking connection
                // so for the time being DO-NOT hit refresh --- leave the old habits!
                socket.on ("disconnect", function () {
                    // telling ERYbody the news
                    io.sockets.json.send ({success: true, mode: "DISCONNECT",  user: socket.handshake.session.user.username});

                    // removing from online_p
                    online_p.splice (online_p.indexOf (socket.handshake.session.user.username), 1);

                    // removing from sockets
                    delete sockets [socket.handshake.session.user.username];

                    // updating followers sockets
                    // if IF wasn't here --- when the last user loges out, iMolly crashes
                    // or if the same user loges in twice and loges out the other one and BOOM! --- i don't know why but this reminded me of Amir --- Racist --- i think not!
                    if (sockets [socket.handshake.session.user.username] !== undefined) {
                        online_p.forEach (function (user) {
                            if (sockets [user].handshake.session.user.followers) {
                                sockets [user].handshake.session.user.followers.forEach (function (follower) {
                                    if (online_p.indexOf (follower) !== -1) {
                                        sockets [follower].leave (socket.handshake.session.user.username);
                                    }
                                });
                            }
                        });
                    }

                    // destroying session
                    sessionStore.destroy (socket.handshake.session.id, function () {
                        console.log ("Session Destroyed");
                    });
                });
            });
        }
    };
}
