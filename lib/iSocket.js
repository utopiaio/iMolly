var crypto = require("./cyper");

/// let's get it on! --- celebrity death match
/// @param {Object} request
/// @param {Object} io
/// @param {Object} pg_client
/// @param {Object} online
/// @param {Object} rooms
/// @param {Array}  online_p
/// @param {Object} sockets
/// @api public
exports.intiate = function (request, io, pg_client, online, rooms, online_p, sockets) {
    var socket = sockets[request.session.user.socket];

    //  hurray a user is online! --- telling ERYbody!
    socket.broadcast.emit("message", {success: true, mode: "ONLINE_PLUS", user: request.session.user.username});

    // for EVERY new initiate we'll be re-initiating ALL sockets
    online_p.forEach (function (user) {
        // FOLLOWINGS of user
        if (online[user].following) {
            online[user].following.forEach (function (following) {
                if (online_p.indexOf (following) != -1) {
                    sockets[online[user].socket].join (following);
                }
            });
        }

        // FOLLOWERS of user
        if (online[user].followers) {
            online[user].followers.forEach (function (follower) {
                if (online_p.indexOf (follower) != -1) {
                    sockets[online[follower].socket].join (user);
                }
            });
        }
    });

    socket.on ("message", function (data) {
        console.log ("mode `%s` detected...", data.mode);

        switch (data.mode) {
            // delete tweet
            case "DELETE_TWEET":
                console.log ("deleting tweet...");
                // this makes sure that twitter delete request came from the OWNER
                if (request.session.user.username == data.tweet.by && request.session.user != undefined) {
                    pg_client.query ("DELETE FROM tweet WHERE id=$1", [data.tweet.id], function (error, result) {
                        // no errors AND deleted ONLY one row --- i.e. assuming Megan Fox is watching over us!
                        if (!error & result.rowCount == 1) {
                            // responding back to the user via socket id --- only the DELETER will get this emit!
                            io.sockets.socket(request.session.user.socket).emit (request.session.user.username, {success: true, mode: data.mode, tweet: data.tweet});
                            // broadcasting to all FOLLOWERS of delete
                            io.sockets.in (request.session.user.username).emit ("message", {success: true, mode: data.mode, tweet: data.tweet});
                            console.log ("success! deleting tweet");
                        }

                        else {
                            // in the case of "error" we'll only be responding back to the user
                            io.sockets.socket (request.session.user.socket).emit (request.session.user.username, {success: false, mode: data.mode, tweet: data.tweet});
                        }
                    }); 
                }

                // this is a really BAD socket --- socket connection will be closed, session cleared, online status removed!
                // TODO: close and clear stuff!
                else {
                    console.log ("closing connection of socket id %s", socket.id);
                }
            break;



            // new tweet tweeted by user
            case "iTWEET":
                console.log ("saving tweet to database...");
                // making sure there is some session before proceeding...
                if (request.session.user != undefined) {
                    pg_client.query ('INSERT INTO tweet (by, tweet) VALUES ($1, $2) RETURNING id, by, tweet, age(now(), "timestamp");', [request.session.user.username, crypto.escape(data.tweet)], function (error, result) {
                        // no errors AND it returned UNO row
                        if (!error & result.rowCount == 1) {
                            var row = result.rows[0];

                            // now we'll be scanning the tweet for # tags --- get it! --- HASH-tags!
                            console.log ("scanning for #...");
                            if (row.tweet.match(/#[a-zA-Z0-9]+/)) {
                                row.tweet.split(" ").forEach (function (word) {
                                    if (word.match(/^#[a-zA-Z0-9_]+$/)) {
                                        pg_client.query ('SELECT * FROM hash WHERE hash ILIKE $1', [word.slice(1)], function (error, result) {
                                            if (!error) {
                                                // brand new hash
                                                if (result.rowCount == 0) {
                                                    pg_client.query ('INSERT INTO hash (hash, initiator, mention_ts[0]) VALUES ($1, $2, now()) RETURNING hash, mentions, initiator;', [word.slice(1), request.session.user.username], function (error, result) {
                                                        if (!error)
                                                            console.log ("#%s initiated", result.rows[0].hash);
                                                            // telling EVERYBODY there's a new HASH
                                                            io.sockets.emit("message", {success: true, mode: "NEW_HASH", hash: result.rows[0]});
                                                    });
                                                }

                                                // posting under a hash
                                                else {
                                                    pg_client.query ('UPDATE hash SET mentions=$1, mention_ts[$2]=now() WHERE hash ILIKE $3 RETURNING hash, mentions, initiator;', [result.rows[0].mentions + 1, result.rows[0].mentions, result.rows[0].hash], function (error, result) {
                                                        if (!error)
                                                            console.log ("#%s now %d", result.rows[0].hash, result.rows[0].mentions);
                                                            // telling EVERYBODY there has been another mention on a hash
                                                            io.sockets.emit("message", {success: true, mode: "MENTION_PLUS", hash: result.rows[0]});
                                                    });
                                                }
                                            }
                                        });
                                    }
                                });
                            }

                            row.owner = true;
                            io.sockets.socket(request.session.user.socket).emit (request.session.user.username, {success: true, mode: data.mode, tweet: row});

                            row.owner = false;
                            io.sockets.in (request.session.user.username).emit ("message", {success: true, mode: data.mode, tweet: row});
                        }

                        else {
                            // in the case of "error" we'll only be responding back to the user
                            socket.emit (request.session.user.username, {success: false, mode: data.mode, tweet: data.tweet});
                        }
                    }); 
                }
            break;

            default:
                console.log ("unknown mode");
            break;
        }
    });
}
