CREATE TABLE IF NOT EXISTS users (
    id serial NOT NULL,
    username character varying(256), -- username - unique
    password character varying(256), -- stores user password, cypered with sha512 + some salt
    following character varying(256)[] DEFAULT '{}'::character varying[], -- accounts the user is following -- i.e. on twitter+
    CONSTRAINT "PK" PRIMARY KEY (id),
    CONSTRAINT username UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS tweet (
    id serial NOT NULL,
    by character varying(256), -- tweet owner
    tweet character varying(141), -- tweet
    "timestamp" timestamp without time zone DEFAULT now(), -- timestamp of when the tweet was posted
    CONSTRAINT pk PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS room (
    id serial NOT NULL,
    name character varying(64), -- yap room name
    owner character varying(256), -- creator of the room
    members character varying(256)[] DEFAULT '{}'::character varying[], -- room members
    public boolean DEFAULT true, -- join without req or EXCLUSIVE
    CONSTRAINT pk_room PRIMARY KEY (id),
    CONSTRAINT username_fk FOREIGN KEY (owner) REFERENCES users (username) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS hash (
    id serial NOT NULL,
    hash character varying(140), -- the hash
    mentions integer DEFAULT 1, -- counts the number of # mentions
    initiator character varying(256), -- who #ed the FIRST #
    mention_ts timestamp without time zone[] DEFAULT '{}'::timestamp without time zone[], -- timesatmp of mention of a hash
    CONSTRAINT pk_hash PRIMARY KEY (id),
    CONSTRAINT fk_initiator FOREIGN KEY (initiator) REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS messages (
    id serial NOT NULL, -- id
    "to" character varying(256), -- reciver -- yes am gonna use this as a 'pk'
    "from" character varying(256), -- from
    "timestamp" timestamp without time zone DEFAULT now(),
    seen boolean DEFAULT false, -- since there's NO way the user 'saw' it, so - when page is opened all will be set to TRUE
    message character varying(2048), -- this is the frekaen message
    CONSTRAINT pk_message PRIMARY KEY (id),
    CONSTRAINT "from" FOREIGN KEY ("from") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "to" FOREIGN KEY ("to") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS request (
    id serial NOT NULL,
    "from" character varying(256), -- who sent the request
    "to" character varying(256), -- the popular one
    type character varying(64), -- request type - room join, tweet follow...
    "timestamp" timestamp without time zone DEFAULT now(),
    CONSTRAINT pk_request PRIMARY KEY (id),
    CONSTRAINT from_fk FOREIGN KEY ("from") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT to_fk FOREIGN KEY ("to") REFERENCES users (username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE
);
