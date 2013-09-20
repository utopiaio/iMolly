var crypto = require("crypto");

/// returns the sha512 hash of a bare password passed --- yes we'll be adding a bit of SALT there...
/// @param {String} password
/// @return {String}
exports.sha512 = function (password) {
    var sha512 = crypto.createHash("sha512");
    sha512.update(password, {encoding: "utf8"});
    sha512.update("SALT", {encoding: "utf8"});
    return sha512.digest("hex");
};



/// checks weather or not we have a user session initiated or not
/// @param {Object} request
/// @return {Boolean}
exports.logged_in = function (request) {
    // we're just checking that there's "some" data @ request.session.user if so, we have a login --- simple and effective! --- i think?!
    return request.session.user == undefined ? false : true;
};



/// clears session data
/// @param {Object} request
exports.clear_session = function (request) {
    request.session = null;
};



/// this is taken from Express
/// Escape special characters in the given string of html.
///
/// @param  {String} html
/// @return {String}

exports.escape = function (html) {
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};
