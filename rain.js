(() => {
  const canvas = document.getElementById('pixel-rain');
  const ctx = canvas.getContext('2d');
  const backCanvas = document.getElementById('pixel-rain-back');
  const backCtx = backCanvas.getContext('2d');
  if (!ctx || !backCtx) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let drops = [], frame = 0, previous = 0, storm = false;
  const streaks = new Map();
  function streak(length, wind, night, phase) {
    const key = `${length}:${wind}:${night}:${phase}`;
    if (streaks.has(key)) return streaks.get(key);
    const image = document.createElement('canvas');
    const padding = Math.ceil(length * wind) + 1;
    image.width = padding + 2;
    image.height = length;
    const paint = image.getContext('2d');
    paint.fillStyle = night ? '#91a6bf' : '#304d68';
    for (let pixel = 0; pixel < length; pixel++) {
      paint.globalAlpha = 1 - pixel / length * .8;
      paint.fillRect(padding + Math.round(phase / 8 - pixel * wind), length - 1 - pixel, 1, 1);
    }
    const result = { image, padding };
    streaks.set(key, result);
    return result;
  }
  const active = () => ['rain', 'storm'].includes(document.documentElement.dataset.weather)
    && !document.body.classList.contains('sky-ended') && !document.hidden;

  function resize() {
    // One logical pixel spans two screen pixels; never blur the particle edges.
    canvas.width = Math.ceil(innerWidth / 2);
    canvas.height = Math.ceil(innerHeight / 2);
    backCanvas.width = canvas.width;
    backCanvas.height = canvas.height;
    backCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
    const count = Math.min(650, Math.max(70, Math.round(canvas.width * canvas.height / (storm ? 700 : 1150))));
    drops = Array.from({ length: count }, (_, i) => {
      const layer = i % 3;
      return { layer, x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        speed: [150, 240, 360][layer] * (.85 + Math.random() * .3),
        length: [4, 7, 11][layer] + Math.floor(Math.random() * 4),
        alpha: [.18, .3, .48][layer] * (.8 + Math.random() * .4) };
    });
  }

  function draw(dt) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    backCtx.clearRect(0, 0, canvas.width, canvas.height);
    const wind = storm ? .16 : .09;
    const night = document.documentElement.dataset.sky === 'night';
    for (const drop of drops) {
      // Distant and middle drops sit behind the cloud; near drops cross in front.
      const paint = drop.layer < 2 ? backCtx : ctx;
      const distance = drop.speed * (storm ? 1.3 : 1) * dt;
      drop.y += distance;
      drop.x += distance * wind;
      if (drop.y - drop.length > canvas.height) {
        drop.y = -Math.random() * 30;
        drop.x = Math.random() * (canvas.width + 40) - 40;
      }
      if (drop.x > canvas.width + 10) drop.x = -10;
      // Reuse the tiny rasterized tail instead of painting each pixel every frame.
      const x = Math.floor(drop.x);
      const phase = Math.min(7, Math.floor((drop.x - x) * 8));
      const sprite = streak(drop.length, wind, night, phase);
      paint.globalAlpha = drop.alpha;
      paint.drawImage(sprite.image, x - sprite.padding, Math.round(drop.y) - drop.length + 1);
    }
    ctx.globalAlpha = 1;
    backCtx.globalAlpha = 1;
  }

  function tick(time) {
    frame = 0;
    if (!active()) return;
    draw(previous ? Math.min((time - previous) / 1000, .05) : 0);
    previous = time;
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    const nextStorm = document.documentElement.dataset.weather === 'storm';
    if (!drops.length || nextStorm !== storm) { storm = nextStorm; resize(); }
    if (!active()) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      backCtx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (reducedMotion.matches) draw(0);
    else frame = requestAnimationFrame(tick);
  }
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-weather', 'data-sky'] });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('resize', () => { resize(); sync(); });
  sync();
})();
