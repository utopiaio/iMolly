var crypto = require(__dirname + "/cyper");

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

    //  hurrah, a user is online! --- telling ERYbody!
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
            // delete tweet...
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
            case "TWEET":
                console.log ("saving tweet to database...");
                // making sure there is some session before proceeding...
                if (request.session.user != undefined) {
                    pg_client.query ('INSERT INTO tweet (by, tweet) VALUES ($1, $2) RETURNING id, by, tweet, age(now(), "timestamp");', [request.session.user.username, crypto.escape(data.tweet)], function (error, result) {
                        // no errors AND it returned UNO row
                        if (!error & result.rowCount == 1) {
                            var row = result.rows[0];

                            // now we'll be scanning the tweet for # tags --- get it! --- HASH-tags!
                            console.log ("scanning for #...");
                            if (row.tweet.match(/#[a-zA-Z0-9_]+/)) {
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
                                                            // well it's obvious the user should join the conversation he started
                                                            socket.join ("#"+ result.rows[0].hash);
                                                            // we'll keep a record of the hash the user has joined/created for the session
                                                            // you might say we should keep of the hash id the db for persistence, my answerer to that is NO!
                                                            // if you ain't new you're OLD, for the same reason i did not add a re-tweet function, either you come up with your own or shut the fuck up!
                                                            request.session.user.hashes.push (result.rows[0].hash);
                                                    });
                                                }

                                                // posting under a hash
                                                else {
                                                    pg_client.query ('UPDATE hash SET mentions=$1, mention_ts[$2]=now() WHERE hash ILIKE $3 RETURNING hash, mentions, initiator;', [result.rows[0].mentions + 1, result.rows[0].mentions, result.rows[0].hash], function (error, result) {
                                                        if (!error) {
                                                            console.log ("#%s now %d", result.rows[0].hash, result.rows[0].mentions);
                                                            // telling EVERYBODY there has been another mention on a hash --- this will be used to update the count on hash mentions
                                                            io.sockets.emit("message", {success: true, mode: "MENTION_PLUS", hash: result.rows[0]});
                                                            // now, we'll be telling eryone in the conversation of this users opinion
                                                            io.sockets.in ("#"+ result.rows[0].hash).emit ("message", {success: true, mode: "HASH_TWEET", tweet: row});
                                                            // now we'll be checking weather or not he 'hasher' is already a "member" or not,
                                                            // if the user is not a member, he'll join, since he mentioned the hash --- he's in the loop
                                                            if (request.session.user.hashes.indexOf (result.rows[0].hash) == -1) {
                                                            	socket.join ("#"+ result.rows[0].hash);
                                                            	request.session.user.hashes.push (result.rows[0].hash);
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
                            io.sockets.socket(request.session.user.socket).emit (request.session.user.username, {success: true, mode: data.mode, tweet: row});

							// same drill, this time is false though --- shocking isn't it!
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



			// user has requested to join a conversation
			case "JOIN_HASH":
				// joining the conversation via a click
				// the regx is to make sure the we're not injected since we're going to use it for query DIRECTLY
				if (request.session.user.hashes.indexOf(data.hash) == -1 && data.hash.match (/^[a-zA-Z0-9_]+$/)) {
					// we'll be returning the latest 15 tweets which contain the hash
					pg_client.query ("SELECT id, by, tweet, age(now(), \"timestamp\") AS age FROM tweet WHERE tweet ILIKE '%#"+ data.hash +" %' OR tweet ILIKE '%#"+ data.hash +"' ORDER BY \"timestamp\" DESC LIMIT 15;", function (error, result) {
						if (!error) {
							socket.join ("#"+ data.hash);
							request.session.user.hashes.push (data.hash);
							io.sockets.socket(request.session.user.socket).emit (request.session.user.username, {success: true, mode: data.mode, tweet: result.rows, hash: data.hash});
						}
					});
				}
			break;

            default:
                console.log ("unknown mode");
            break;
        }
    });
};
