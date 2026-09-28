let birdshot = 0;
let birdFlight;
let birdInterval;

document.addEventListener("DOMContentLoaded", () => {
  PIMG();
  birdInterval = window.setInterval(PIMG, 12000);
  document.getElementById("img").addEventListener("click", shoot);
});


function PIMG() {
  if (birdshot >= 5) return;

  const animated = document.getElementById('img');
  if (birdFlight) birdFlight.cancel();
  const maxTop = Math.max(0, window.innerHeight - animated.offsetHeight);
  const top = Math.floor(Math.random() * (maxTop + 1));
  animated.src = "img/birdie.gif";
  animated.style.left = "0px";
  animated.style.top = `${top}px`;
  animated.style.display = "block";
  animated.style.pointerEvents = "auto";
  birdFlight = animated.animate([
    // keyframes
    { transform: "translateX(-100%)" },
    { transform: "translateX(2000%)" }
  ], {
       duration: 10000,
       iterations: 1,
       fill: 'forwards'
    });

}

function shoot() {
  if (birdshot >= 5) return;

  const animated = document.getElementById('img');
  const position = animated.getBoundingClientRect();
  animated.style.left = `${position.left}px`;
  animated.style.top = `${position.top}px`;
  if (birdFlight) birdFlight.cancel();
  animated.style.transform = "none";
  animated.src = "img/deadMOSHED.gif";
  animated.style.pointerEvents = "none";

  birdshot += 1;

  document.getElementById("overlay").style.opacity = 0.2 * birdshot;
  document.getElementById("overlay").style.display = "block";


  const overlay = document.getElementById("overlay");
  window.setTimeout(() => { overlay.style.display = "none"; }, birdshot * 1000);

  if (birdshot >= 5) {
    window.clearInterval(birdInterval);
    document.getElementById("body").style.background = "#cfcfcf";
    document.getElementById("nice_cloud").style.filter = "grayscale(100%)";
    document.getElementById("bird").style.display = "none";
    animated.style.display = "none";
    return;
  }

  birdFlight = animated.animate([
    // keyframes
    { transform: "translateY(0)" },
    { transform: "translateY(1000%)" }
  ], {
       duration: 5000,
       iterations: 1,
       fill: 'forwards'
    });

}
