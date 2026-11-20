"""Build the public daily shell and the local player preview."""
import hashlib
import os
import pathlib
import re

curator = pathlib.Path(__file__).resolve().parents[1]
root = curator.parent
template = (curator / 'index.html').read_text()


def versioned_assets(html, page):
    paths = {
        '../styles.css': root / 'styles.css',
        '../logic.js': root / 'logic.js',
        '../world-map.js': root / 'world-map.js',
        '../app.js': root / 'app.js',
        'data.js': curator / 'data.js',
        '../daily/edition.js': root / 'daily/edition.js',
    }
    for url, asset in paths.items():
        if f'"{url}"' in html:
            digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:10]
            url_path = os.path.relpath(asset, page.parent)
            html = html.replace(f'"{url}"', f'"{url_path}?v={digest}"')
    page.parent.mkdir(exist_ok=True)
    page.write_text(html)


player = template.replace('<body>', '<body data-mode="public">')
player = player.replace('natGuessr · Curator desk', 'natGuessr Beta · Daily game')
player = player.replace('href="#curate" data-view="curate" aria-label="natGuessr curator desk"',
                        'href="./" aria-label="natGuessr Beta"')
player = player.replace('nat<span>Guessr</span></a>', 'nat<span>Guessr</span><small>Beta</small></a>')
player = re.sub(r'<nav aria-label="Main">.*?</nav>',
                '<nav aria-label="Main"></nav>', player)
player = re.sub(r'    <section id="(?:curate|queue)-view".*?</section>\n', '', player, flags=re.S)
player = re.sub(r'  <dialog id="detail-dialog".*?</dialog>\n', '', player)
player = re.sub(r'<button id="game-back".*?</button>', '', player)
player = player.replace('<p>Schedule a game using three approved sets in your pile.</p>'
                        '<button data-view="queue" class="button primary">Open the pile</button>',
                        '<p>Check back for the next daily game.</p>')
edition = '<script src="../daily/edition.js"></script>'
bank = '<script src="data.js"></script>'
versioned_assets(player.replace(bank, ''), root / 'daily/index.html')

preview = player.replace('data-mode="public"', 'data-mode="preview"').replace(edition, '')
preview = preview.replace('<nav aria-label="Main"></nav>',
                          '<nav aria-label="Main"><a id="exit-player-preview" class="nav-button" href="../">'
                          'Exit player preview</a></nav>')
if (curator / 'data.js').exists():
    versioned_assets(preview, curator / 'preview/index.html')
