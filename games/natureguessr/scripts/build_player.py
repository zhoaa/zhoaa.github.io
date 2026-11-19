"""Build the public player entry point from the shared application shell."""
import pathlib,re,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
assets=('styles.css','data.js','published-schedule.js','logic.js','app.js')
for file in assets:
    version=hashlib.sha256((root/file).read_bytes()).hexdigest()[:10]
    html=re.sub(r'"'+re.escape(file)+r'(?:\?v=[^"]*)?"','"'+file+'?v='+version+'"',html)
(root/'index.html').write_text(html)
html=html.replace('<body>','<body data-mode="public">').replace('NatureGuessr · Curator desk</title>','NatureGuessr · Daily game</title>')
html=html.replace('href="#curate" data-view="curate" aria-label="NatureGuessr curator desk"','href="./" aria-label="NatureGuessr daily game"')
html=re.sub(r'<nav aria-label="Main">.*?</nav>','<nav aria-label="Main"><a class="nav-button active" href="./" data-view="daily">Daily game</a></nav>',html)
html=html.replace('<button id="help-button"', '<a id="exit-player-preview" class="text-button" href="../" hidden>Exit player preview</a><button id="help-button"')
html=html.replace('Build a daily edition from three approved sets in your queue.','No game has been published for today.').replace('<button data-view="queue" class="button primary">Open the queue</button>','')
html=re.sub(r'<h3>Curate</h3>.*?(?=<h3>Evidence, not certainty</h3>)','',html)
for file in assets:
    html=html.replace(f'"{file}?',f'"../{file}?')
out=root/'daily';out.mkdir(exist_ok=True);(out/'index.html').write_text(html)
print(out/'index.html')
