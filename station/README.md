# Serva print station (Node)

The print station as a small background process, for a Raspberry Pi, a mini PC or an old
laptop sitting beside the printer. Identical contract to the Android app in
`android-station/` — the server cannot tell them apart.

```
pull  →  render  →  print  →  acknowledge
```

It signs in as a normal staff user, claims jobs from the server for its own station id,
renders each one by handing it to `/print/render` in a headless Chromium it keeps open, writes
the resulting ESC/POS bytes to the printer's socket on port 9100, and acknowledges. Until it
acknowledges, the job stays pending on the server and is offered again — so a crash costs a
duplicate at worst, never a lost ticket.

Nothing here decides how a receipt looks. That is the server's page, which is the same React
component the dashboard prints with, so a café changing its receipt style or switching to
English-only sees it on the next ticket without touching this.

## Running one

```bash
npm install                       # also fetches Chromium
cp station.example.json station.json && $EDITOR station.json
npm start
```

Don't know the printer's IP? Switch it off, hold FEED, switch it on. It prints its own
settings slip. Ask whoever set up the WiFi to reserve that address for it, or printing stops
the day the router hands out a different one.

Turn the browser print-station switch **off** in Settings → Branch & printer on every other
device, so the café has one station and paper comes out where people expect it.

## Keeping it running

```ini
# /etc/systemd/system/serva-station.service
[Unit]
Description=Serva print station
After=network-online.target

[Service]
WorkingDirectory=/opt/serva-station
ExecStart=/usr/bin/node station.mjs /opt/serva-station/station.json
Restart=always
RestartSec=10
User=serva

[Install]
WantedBy=multi-user.target
```

## Give it its own account

The config holds a password in plain text. Create a staff user with the orders permission and
nothing else, and use that.
