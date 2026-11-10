# Crossbirds media server for Windows

1. Download the [official Windows Caddy ZIP](https://caddyserver.com/docs/install), choosing Windows amd64 for most Intel or AMD PCs or Windows arm64 for ARM PCs. Extract `caddy.exe` next to `Start-Media.cmd`.
2. Double-click `Start-Media.cmd`. It creates a `photos` folder and starts the server. Keep the window open while serving. Open [the health check](http://127.0.0.1:8080/healthz) on that Windows machine.
3. Copy an image into `photos`. For example, `photos/owls/snowy.jpg` is available at `http://127.0.0.1:8080/media/owls/snowy.jpg`. New files work immediately. Keep names lowercase and use hyphens in place of spaces for easy links.

Once you add the executable, you can zip the whole folder and copy it to another Windows PC of the same architecture. Extract before running. The launcher needs no installer or administrator rights.

## Connect Crossbirds

The local listener is reachable on the Windows PC. To make it reachable from GitHub Pages, [create a named Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/) on that PC with a public HTTPS hostname you control, such as `media.example.com`. Point its origin at `http://127.0.0.1:8080`. Check `https://media.example.com/healthz` and a real photo over mobile data before linking from your blog.

Use a photo URL directly in an image tag or use it as the target of a full-resolution link:

```html
<a href="https://media.example.com/media/owls/snowy-full.jpg">
  <img src="https://media.example.com/media/owls/snowy.jpg"
       alt="Snowy owl perched on a fence post" loading="lazy">
</a>
```

Both files in the example go under `photos/owls/`. Caddy serves the uploaded bytes as-is. JPEG, PNG, WebP, AVIF and GIF are accepted. Use a new filename when replacing a photo so visitors get the update immediately.

Only put files intended for public access in `photos`. Directory browsing is disabled. Keep symbolic links and Windows junctions out of the folder because Caddy can follow them. The server needs the PC awake and online. For continuous hosting after the trial, arrange for both Caddy and the tunnel to start when Windows starts.
