// Update only during short glitch bursts; no continuous rendering loop.
(() => {
  const slices = [...document.querySelectorAll('.cloud-slice')];
  const fragments = [...document.querySelectorAll('.cloud-edge')];
  const icons = [...document.querySelectorAll('#profile .brand-icons:not(#bird)')];
  icons.forEach(icon => icon.addEventListener('pointerenter', () => icon.classList.remove('icon-glitch')));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  const integer = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const offset = magnitude => integer(1, magnitude) * 4 * (Math.random() < .5 ? -1 : 1);
  const clip = (start, end, left = 0, right = 0) =>
    `inset(${start / 128 * 100}% ${right / 192 * 100}% ${(128 - end) / 128 * 100}% ${left / 192 * 100}%)`;
  const active = () => document.body.classList.contains('sky-ended') && !document.hidden && !reducedMotion.matches;

  function reset() {
    slices.forEach(slice => { slice.style.transform = ''; });
    fragments.forEach(fragment => { fragment.style.opacity = '0'; });
    icons.forEach(icon => icon.classList.remove('icon-glitch'));
  }

  function distort() {
    icons.forEach(icon => {
      const glitch = !icon.matches(':hover') && Math.random() < .2;
      icon.classList.toggle('icon-glitch', glitch);
      if (!glitch) return;
      icon.style.setProperty('--icon-shift-x', `${integer(-1, 1) * 2}px`);
      icon.style.setProperty('--icon-shift-y', `${integer(-1, 1)}px`);
      icon.style.setProperty('--icon-echo-x', `${Math.random() < .5 ? -2 : 2}px`);
    });
    // Vary the actual bands, while keeping their resting union a complete cloud.
    const cuts = [0, integer(28, 44), integer(54, 70), integer(82, 100), 128];
    slices.forEach((slice, index) => {
      slice.style.clipPath = clip(cuts[index], cuts[index + 1]);
      slice.style.transform = Math.random() < .22 ? '' : `translate(${offset(7)}px, ${integer(-2, 2) * 4}px)`;
    });
    const count = Math.random() < .4 ? integer(2, 3) : 1;
    fragments.forEach((fragment, index) => {
      if (index >= count) { fragment.style.opacity = '0'; return; }
      // Alternate torn outlines and solid pieces, with new pixel-aligned crops.
      const asset = Math.random() < .65 ? 'img/cloud-glitch-edge.svg' : 'img/main-cloud.svg';
      if (fragment.getAttribute('src') !== asset) fragment.setAttribute('src', asset);
      const top = integer(16, 94);
      fragment.style.clipPath = clip(top, Math.min(112, top + integer(4, 26)), integer(0, 60), integer(0, 60));
      fragment.style.transform = `translate(${offset(12)}px, ${offset(3)}px)`;
      fragment.style.opacity = String(integer(18, 48) / 100);
    });
  }

  function burst(remaining = integer(2, 4)) {
    if (!active()) { reset(); return; }
    distort();
    timer = setTimeout(() => {
      if (remaining > 1) burst(remaining - 1);
      else {
        reset();
        timer = setTimeout(() => burst(), Math.random() < .3 ? integer(300, 650) : integer(1200, 2200));
      }
    }, integer(80, 170));
  }

  function sync() {
    clearTimeout(timer);
    reset();
    if (active()) timer = setTimeout(() => burst(), integer(700, 1100));
  }
  document.addEventListener('bird-finalized', sync);
  document.addEventListener('bird-reset', sync);
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  sync();
})();
