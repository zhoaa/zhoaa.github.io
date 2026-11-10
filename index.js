let birdshot = 0;
let birdFlight;
let birdInterval;
let shotTimer;
// Keep weather stable during this visit; local time still updates every minute.
const cloudyVisit = Math.random() < 0.25;
let skyPreview = 'auto'; // Temporary preview; resets on reload.
let weatherPreview = 'auto';
let localWeather = null;
const skyPalettes = {
  night: ['#0c142b', '#283653'], sunrise: ['#b5a4cf', '#ffd4a1'],
  midday: ['#8dcfd3', '#c1e9dc'], sunset: ['#745e9c', '#ee9f82']
};
function blendColor(a, b, amount) {
  const channels = [1, 3, 5].map(offset => Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(b.slice(offset, offset + 2), 16) * amount));
  return `rgb(${channels.join(',')})`;
}

function updateSkyTheme() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const localTheme = hour >= 5 && hour < 9 ? 'sunrise'
    : hour >= 9 && hour < 17 ? 'midday'
    : hour >= 17 && hour < 21 ? 'sunset' : 'night';
  const theme = skyPreview === 'auto' ? localTheme : skyPreview;
  if (document.documentElement.dataset.sky !== theme) document.documentElement.dataset.sky = theme;
  const root = document.documentElement;
  const weather = localWeather;
  const kind = weatherPreview !== 'auto' ? weatherPreview : weather ? weatherKind(weather.weather_code) : 'default';
  const cloudy = kind === 'default' ? cloudyVisit && localTheme === 'midday' : ['cloudy', 'rain', 'snow', 'storm', 'fog'].includes(kind);
  root.classList.toggle('cloudy-day', cloudy);
  if (root.dataset.weather !== kind) root.dataset.weather = kind;
  // Hold each palette through its core hours, blend continuously at the edges.
  const stops = [[0,'night'],[5,'night'],[7,'sunrise'],[10,'midday'],[16,'midday'],[19,'sunset'],[22,'night'],[24,'night']];
  const index = stops.findIndex(stop => stop[0] > hour);
  const left = stops[index - 1], right = stops[index];
  const mix = (hour - left[0]) / (right[0] - left[0]);
  const from = skyPalettes[skyPreview === 'auto' ? left[1] : skyPreview];
  const to = skyPalettes[skyPreview === 'auto' ? right[1] : skyPreview];
  root.style.setProperty('--sky-top', blendColor(from[0], to[0], mix));
  root.style.setProperty('--sky-bottom', blendColor(from[1], to[1], mix));
  root.style.setProperty('--overcast', kind === 'storm' ? '.5' : cloudy ? '.28' : '0');
  updateCelestialBodies(skyPreview === 'auto' ? hour : { sunrise: 7, midday: 13, sunset: 19, night: 1 }[skyPreview]);
}

function updateCelestialBodies(hour) {
  const root = document.documentElement;
  // Decorative daily arcs: sunrise at 6, sunset at 20; night wraps midnight.
  const daylight = hour >= 6 && hour <= 20;
  const sunProgress = Math.max(0, Math.min(1, (hour - 6) / 14));
  const moonProgress = ((hour - 20 + 24) % 24) / 10;
  const position = (name, progress, visible) => {
    root.style.setProperty(`--${name}-x`, `${8 + 84 * progress}%`);
    root.style.setProperty(`--${name}-y`, `${78 - 65 * Math.sin(Math.PI * progress)}%`);
    root.style.setProperty(`--${name}-opacity`, visible ? String(Math.min(1, progress * 12, (1 - progress) * 12)) : '0');
  };
  position('sun', sunProgress, daylight);
  position('moon', Math.min(1, moonProgress), !daylight);
  root.style.setProperty('--stars-opacity', daylight ? '0' : String(Math.min(1, moonProgress * 8, (1 - moonProgress) * 8)));
}
updateSkyTheme();
window.setInterval(updateSkyTheme, 10000);
document.addEventListener('visibilitychange', updateSkyTheme);

document.addEventListener("DOMContentLoaded", () => {
  initLocalWeather();
  const duck = document.getElementById("img");
  duck.addEventListener("click", shoot);
  document.addEventListener("pointermove", moveCrosshair);
  // Decode every pose before it is needed on a hit.
  ['fly-1', 'fly-2', 'fly-3', 'shot', 'fall-1', 'fall-2'].forEach(frame => {
    const image = new Image();
    image.src = `img/duck-${frame}.png`;
    image.decode().catch(() => {});
  });
  PIMG();
  birdInterval = window.setInterval(PIMG, 12000);
});

function weatherKind(code) {
  if (code >= 95) return 'storm';
  if ([71,73,75,77,85,86].includes(code)) return 'snow';
  if (code >= 51 && code <= 82) return 'rain';
  if ([45,48].includes(code)) return 'fog';
  if (code === 1 || code === 2) return 'partly-cloudy';
  return code === 3 ? 'cloudy' : 'clear';
}

async function initLocalWeather() {
  const lookupController = new AbortController();
  const lookupTimeout = window.setTimeout(() => lookupController.abort(), 8000);
  try {
    // IP-based city estimate; no device-location permission or persistent storage.
    const response = await fetch('https://ipapi.co/json/', { signal: lookupController.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Approximate location unavailable');
    const location = await response.json();
    if (location.error || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw new Error('Invalid approximate location');
    const params = new URLSearchParams({ latitude: location.latitude.toFixed(1), longitude: location.longitude.toFixed(1), current: 'weather_code,cloud_cover', timezone: 'auto' });
    async function refreshWeather() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Weather unavailable');
        const data = await response.json();
        if (!Number.isFinite(data.current?.weather_code) || !Number.isFinite(data.current?.cloud_cover)) throw new Error('Invalid weather');
        localWeather = data.current;
      } catch {
        localWeather = null;
      } finally {
        window.clearTimeout(timeout);
        updateSkyTheme();
      }
    }
    refreshWeather();
    window.setInterval(refreshWeather, 15 * 60 * 1000);
  } catch {
    localWeather = null;
    updateSkyTheme();
  } finally {
    window.clearTimeout(lookupTimeout);
  }
}

function moveCrosshair(event) {
  const crosshair = document.getElementById("crosshair");
  crosshair.style.transform = `translate3d(${Math.round(event.clientX) - 17}px, ${Math.round(event.clientY) - 17}px, 0)`;
}

function PIMG() {
  if (birdshot >= 5) return;
  const duck = document.getElementById("img");
  if (duck.classList.contains('is-shot') || duck.classList.contains('is-falling')) return;
  if (birdFlight) birdFlight.cancel();
  duck.style.display = "block";
  const top = Math.floor(Math.random() * Math.max(1, window.innerHeight - duck.offsetHeight));
  duck.classList.add("is-flying");
  duck.style.left = "0px";
  duck.style.top = `${top}px`;
  duck.style.display = "block";
  duck.style.opacity = "1";
  duck.style.pointerEvents = "auto";
  birdFlight = duck.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(2000%)" }], { duration: 10000, fill: "forwards" });
}

function flashHit() {
  const overlay = document.getElementById("overlay");
  overlay.style.setProperty("--flash-strength", String(Math.min(1, birdshot / 5)));
  overlay.style.animation = "none";
  void overlay.offsetWidth;
  const duration = birdshot >= 5 ? 4000 : 1500;
  overlay.style.animation = `hit-flash ${duration}ms ease-in-out forwards`;
}

function shoot() {
  if (birdshot >= 5 || !document.getElementById('img').classList.contains('is-flying')) return;
  const duck = document.getElementById("img");
  const position = duck.getBoundingClientRect();
  duck.style.left = `${position.left}px`;
  duck.style.top = `${position.top}px`;
  if (birdFlight) birdFlight.cancel();
  duck.classList.remove("is-flying");
  duck.classList.add("is-shot");
  duck.style.pointerEvents = "none";
  birdshot += 1;
  flashHit();
  window.clearTimeout(shotTimer);
  if (birdshot >= 5) {
    window.clearInterval(birdInterval);
    finishFinalDeath();
    return;
  }
  shotTimer = window.setTimeout(() => {
    duck.classList.replace('is-shot', 'is-falling');
    birdFlight = duck.animate([{ transform: "translateY(0)" }, { transform: `translateY(${Math.max(duck.offsetHeight * 10, window.innerHeight - position.top + duck.offsetHeight)}px)` }], { duration: 5000, fill: "forwards" });
    birdFlight.finished.then(() => {
      duck.style.display = 'none';
      duck.classList.remove('is-falling');
    }).catch(() => {});
  }, 220);
}

function finishFinalDeath() {
  document.body.classList.add('sky-ended');
  document.getElementById("img").style.display = "none";
  const birdIcon = document.getElementById("bird");
  birdIcon.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(120px,-90px)", opacity: 0 }], { duration: 700, easing: "ease-in", fill: "forwards" });
  document.dispatchEvent(new Event("bird-finalized"));
}
