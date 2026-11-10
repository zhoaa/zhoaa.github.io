//--------------------------------------------------------------------
// Code for the obfuscator.
// Don't change any of this unless you ABSOLUTELY know what you're doing.
//--------------------------------------------------------------------
var obfuData = obfu_data;

const delay = obfuData.delay
const start_time = obfuData.start_time
const end_time = obfuData.end_time
const disp_time = obfuData.disp_time
const loop = obfuData.loop
const obfu_chars = obfuData.obfu_chars
let phrases = obfuData.phrases

class TextScramble {
  constructor(el) {
    this.el = el
    this.chars = obfu_chars
    this.update = this.update.bind(this)
  }
  setText(newText) {
    const oldText = this.el.innerText
    const length = Math.max(oldText.length, newText.length)
    const promise = new Promise((resolve) => this.resolve = resolve)
    this.queue = []
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || ''
      const to = newText[i] || ''
      const start = Math.floor(Math.random() * start_time)
      const end = start + Math.floor(Math.random() * end_time)
      this.queue.push({ from, to, start, end })
    }
    cancelAnimationFrame(this.frameRequest)
    this.frame = 0
    this.update()
    return promise
  }
  update() {
    let output = ''
    let complete = 0
    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i]
      if (this.frame >= end) {
        complete++
        output += to
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.randomChar()
          this.queue[i].char = char
        }
        output += `<span class="dud">${char}</span>`
      } else {
        output += from
      }
    }
    this.el.innerHTML = output
    if (complete === this.queue.length) {
      this.resolve()
    } else {
      this.frameRequest = requestAnimationFrame(this.update)
      this.frame++
    }
  }
  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)]
  }
}

const el = document.querySelector('.text')
const fx = new TextScramble(el)
const img = document.querySelector('.pimg');


// let counter = 0
// const next = () => {
//   fx.setText(phrases[counter]).then(() => {
//     setTimeout(next, disp_time)
//   })
//   if (!loop & counter < phrases.length) {
//     counter = counter + 1;
//   } else if (counter <= phrases.length) {
//     counter = (counter + 1) % phrases.length;
//   }
// }

function start() {
    fx.setText(phrases[0]);
    el.removeEventListener("mouseover", start)
    el.addEventListener("mouseleave", destroy);
}

function destroy(){
    fx.setText(phrases[1]);
    
    el.addEventListener("mouseover", start);
    el.removeEventListener("mouseleave", destroy);
}

let birdshoot = 0;

function bird() {
    birdshoot++;
    if(birdshot < 5) {
        fx.setText(phrases[Math.floor(Math.random() * 5) + 2]);
    }
    
}

const originalGreeting = phrases.slice(0, 2);
let finalBirdState = false;
document.addEventListener("bird-finalized", function() {
    finalBirdState = true;
    fx.setText(phrases[7]);
    phrases[0] = "...";
    phrases[1] = "...";
});
document.addEventListener('bird-reset', function() {
    finalBirdState = false;
    [phrases[0], phrases[1]] = originalGreeting;
    fx.setText(phrases[1]);
});

img.addEventListener("click", bird);
el.addEventListener("mouseover", start);
el.addEventListener('click', function(){
    window.location = finalBirdState ? 'aboutbirds.html' : 'aboutme.html';
})
