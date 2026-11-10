// Local development: automatic. Deployment: hidden by default.
// Override either environment with ?preview=1 or ?preview=0.
(() => {
  const override = new URLSearchParams(location.search).get('preview');
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const enabled = override === '1' || (override !== '0' && local);
  const template = document.getElementById('preview-controls');
  if (!enabled) { template.remove(); return; }
  document.body.append(template.content.cloneNode(true));
  template.remove();
  const controls = document.querySelector('.theme-preview');
  controls.querySelector('#weather-preview').addEventListener('change', event => {
    weatherPreview = event.target.value;
    updateSkyTheme();
  });
  controls.querySelectorAll('[data-theme]').forEach(button => {
    button.addEventListener('click', () => {
      skyPreview = button.dataset.theme;
      controls.querySelectorAll('[data-theme]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      updateSkyTheme();
    });
  });
  const dead = controls.querySelector('#dead-preview');
  document.addEventListener('bird-finalized', () => dead.setAttribute('aria-pressed', 'true'));
  dead.addEventListener('click', () => {
    const ended = document.body.classList.contains('sky-ended');
    window.clearTimeout(shotTimer);
    window.clearInterval(birdInterval);
    if (birdFlight) birdFlight.cancel();
    document.getElementById('overlay').style.animation = 'none';
    const duck = document.getElementById('img');
    duck.classList.remove('is-shot', 'is-falling', 'is-flying');
    if (!ended) {
      birdshot = 5;
      finishFinalDeath();
    } else {
      birdshot = 0;
      document.body.classList.remove('sky-ended');
      document.getElementById('bird').getAnimations().forEach(animation => animation.cancel());
      document.dispatchEvent(new Event('bird-reset'));
      dead.setAttribute('aria-pressed', 'false');
      PIMG();
      birdInterval = window.setInterval(PIMG, 12000);
    }
  });
})();
