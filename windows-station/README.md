# Serva Station (Windows)

The print station for a café whose counter computer runs Windows. Same contract as the Android
app in `android-station/` and the Node loop in `station/`; the server cannot tell them apart.

    pull  →  render  →  print  →  acknowledge

1. **Pull**: signs in as a staff user and calls `POST /api/dashboard/print-jobs/pull` with this
   PC's station id every five seconds. The id starts `windows-`, never `st-`, which the server
   reads as a browser tab.
2. **Render**: hands the job to `/print/render` in a window nobody sees: the same React
   component and rasteriser the dashboard prints with.
3. **Print**: writes the ESC/POS bytes to the printer's socket on port 9100, after asking it
   over the status channel whether it is out of paper or has its cover open.
4. **Acknowledge**: until it does, the job stays pending on the server and is offered again.
   Ids printed but not yet acknowledged are kept on disk, so a crash in that gap costs neither
   a lost ticket nor a duplicate.

## How the printer connects

Nothing changes: the printer stays plugged into the café router (or on its Wi-Fi), and the PC
joins the same network by cable or Wi-Fi. No driver, and do not add the printer in Windows'
"Printers & scanners". The app talks to it directly. Ask whoever runs the router to reserve the
printer's address, or printing stops the day the router hands it a different one.

USB printers are not supported. The app speaks to a network printer only.

## Setting one up at a café

1. Download `serva-station-setup.exe` from Settings → Branch & printer → Serva Station, and run
   it. It is not code-signed, so Windows SmartScreen says it "protected your PC": choose
   **More info → Run anyway**. It installs for the current Windows user, needs no admin rights,
   and opens by itself.
2. Sign in with a staff account, pick the branch, pick the printer. The app sweeps every
   network the PC is on and asks each hit for ESC/POS status, so "Answered as a printer" means
   exactly that. **Enter the address myself** takes the number off the FEED self-test slip.
   An address on a different range than the PC is caught before anything is tried, with the
   fix on screen.
3. Print the test slip, confirm paper came out, and it starts collecting. From then on it
   starts with Windows (minimised in the taskbar). Closing the window hides it next to the
   clock; only **Quit** in that tray icon's menu stops printing, and it asks first.

## Keeping it alive

The app holds off Windows' idle sleep while it is collecting. It cannot stop someone shutting
the PC down, and it runs only once a Windows user has signed in. So the café needs to:

1. **Leave the PC on** and on mains power.
2. **Sign Windows in automatically**, or have someone sign in each morning. After a power cut or
   an update reboot, nothing prints until a user session starts.
3. **Not quit it** from the tray icon. Turn the browser print-station switch **off** on every
   other device, so the café has one station.

The staff password is kept encrypted with Windows' own per-user protection (DPAPI). Still, give
a station its own staff account with the orders permission and nothing else.

## Building

```
./make-exe.sh        # builds dist/serva-station-setup.exe and copies it into the frontend
```

It builds on macOS or Linux as well as Windows. `toolsets.nsis` in `package.json` selects the
NSIS bundle that has a native Apple-silicon `makensis`; the default one needs Rosetta. The
installer is ~100MB, nearly all of it Electron's Chromium, so it is not committed. See
`make-exe.sh`.

To work on it: `npm install && npm start`, with `station/fake-printer.mjs` running as the
printer. On macOS, Electron is subject to the Local Network privacy setting and cannot reach
LAN addresses unless allowed; enter `127.0.0.1` to use the fake printer on the same Mac.

## Known risks

- **Tested on macOS only.** Setup, rendering, printing, paper-out, printer-off, token expiry,
  pause and restart were driven end to end against `fake-printer.mjs` and a mock API. The
  Windows-only parts have not run on a Windows PC yet: the installer, the tray, starting with
  Windows, and DPAPI. The first café, or a spare Windows laptop, is that test.
- **Unsigned.** SmartScreen warns on every new version until it builds reputation. A code-signing
  certificate removes the warning.
- **No mDNS.** The Android app also asks the network over mDNS, which finds a printer on a
  different subnet. Here, that printer is found by **Search wider** or by typing its address.
