/// it basically ads a JSON header, makes everything clean and tidy and sends it - qJSON > quick JSON - instead of writing it every fucking response
/// @param {Object} response
/// @param {Object} data
/// @api public

exports.qJSON = function (response, data) {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Length', Buffer.byteLength (JSON.stringify (data)));
    response.end (JSON.stringify (data));
}
