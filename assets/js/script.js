/// adds '_csrf' key to the object sent
/// so that our post or whatever does not get rejected like a FAT chick
///
/// @param {Object} data
/// @return {Object}
function csrf (data) {
    data._csrf = $("#csrf").val();
    return data;
}

/// calls pnotify plug-in --- it pretty neat!
///
/// @param {String} message
/// @param {String} message_type
function pnotify (message, message_type) {
    $.pnotify ({
        title: false,
        text: message,
        history: false,
        //addclass: "visible-lg visible-md",
        type: message_type,
        delay: 3750,
        width: "25%",
        icon: "none",
        opacity: 0.9475,
        animation: {
            effect_in: "fade",
            effect_out: "fade"
        },
        animate_speed:1275
    });
}

/// since we're going to loading the page via Ajax - we'll be binding it AFTER we load
/// by calling this functuwae --- hope i spelled it right!
function bind_menu () {
    $(".list-group-item").click (function () {
        $(".list-group-item").removeClass ("active");
        $(".iChat").hide();
        $(".iChat").removeClass("hide");
        $(this).addClass("active");
        $("#"+ $(this).attr("activate")).show("fade", 675);
    });
};
