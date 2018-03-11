//declarations
var $window = $(window);

//resize splash of image
var bg = $('#splash');
function resizeBackground() {
    bg.height($window.height());
}
resizeBackground();

//resize splash div on resize
$(window).on('resize', function(){
    resizeBackground();
});


//Typed.Js
var options = {
    strings: ['Adrik Grigorian.', 'a Developer.', 'a Designer.', 'a Gamer.', 'Adrik Grigorian.'],
    typeSpeed: 100,
    loop: false
};

//Instantiate typed.js with options
new Typed('.element', options);