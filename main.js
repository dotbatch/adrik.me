//declarations
var $window = $(window),
    $body = $('body');

//resize splash of image
var bg = $('#splash');
function resizeBackground() {
    bg.height(jQuery(window).height());
}
resizeBackground();


//Typed.Js to give page some animation
var options = {
    strings: ['Adrik Grigorian.', 'Designer.', 'Developer.', 'Gamer.', 'Adrik Grigrorian.'],
    typeSpeed: 100,
    loop: false,
}

var typed = new Typed('.element', options);