# Serva Station (Android)

The print station as a background app, rather than a browser tab.

A tab stopped the moment the tablet slept, Chrome was killed, or a member of staff navigated
away — and it stopped silently. This does not: a foreground service keeps polling with the
screen off, restarts itself after a power cut, and shows the café a notification saying what
it last did.

## What it does

    pull  →  render  →  print  →  acknowledge

1. **Pull** — signs in as a normal staff user and calls `POST /api/dashboard/print-jobs/pull`
   with this device's station id every five seconds. The server records the device as
   collecting and claims each job for it, so two stations never print the same ticket.
2. **Render** — hands the job to `/print/render` in an off-screen WebView. That page is the
   same React component, CSS and rasteriser the dashboard prints with, so a receipt cannot
   look one way from a tablet and another from here. A café changing its receipt style or
   switching to English-only sees it on the next ticket, with no app update.
3. **Print** — writes the returned ESC/POS bytes to the printer: a socket on port 9100 for a
   network printer, or a Bluetooth Classic (SPP) link for a paired one. Same bytes either
   way. No driver, no SDK, no RawBT or Cleanter in the middle.
4. **Acknowledge** — until it does, the job stays pending on the server and is offered again.
   A crash anywhere costs a duplicate at worst, never a lost ticket.

## Setting one up

1. Install, open, sign in with a staff account and pick the branch.
2. Pick the printer. The app asks the network over mDNS **and** sweeps the addresses on its
   own subnets, then offers what answers. A printer that answers ESC/POS status is labelled
   "Answered as a printer", which is the difference between the machine you want and something
   that merely has a port open. Several printers on the WiFi is not a collision: each has its
   own address, the list shows that address, and **Enter the address myself** takes the number
   off the FEED slip when you are not sure which row is the counter.
   *If nothing is found*, the printer is usually on a different range of addresses than the
   tablet — a static IP left over from wherever it was installed before. mDNS finds those when
   the printer announces itself; when it does not, **Search wider** tries the /24s a
   hand-configured printer really ends up on, and the empty state explains the FEED-button
   self-test that makes the printer print its own address.
3. **Bluetooth instead?** Pair the printer once in Android's own Bluetooth settings, then tap
   **Use a Bluetooth printer** and pick it from the paired list. The app never scans for
   unpaired devices, which is why it needs no location permission. Cheap printers that refuse
   the standard serial-port UUID are retried over an insecure link, then on RFCOMM channel 1.
4. Print the test slip, confirm paper came out, and save. Collecting does not start until that
   confirmation — a reboot mid-setup will not quietly begin printing. Allow the battery
   exemption when Android asks (that is what stops the tablet sleeping the app overnight).
   The notification appears and the station starts pulling jobs from Serva. The screen can
   be turned off; leave the tablet on a charger. Pause collecting from the status screen if
   you need the printer for something else without wiping the setup.

## Keeping it alive in the background

The app is a foreground service: it holds a CPU wake lock and a Wi-Fi lock, restarts after
reboot (including Xiaomi/HTC “quick boot”), restarts if someone swipes it off Recents, and
nudges itself every ten minutes if a phone maker killed it anyway. That is the most Android
will let an app do for itself. The café still has to:

1. **Leave the tablet on a charger.** A counter tablet that is not plugged in will be
   throttled no matter what the app requests.
2. **Tap Allow** on “Stop Android from sleeping this app” (battery optimisation). The status
   screen keeps the button until this is granted.
3. **Do not swipe Serva Station off the recent-apps list, and never Force stop it.** Force
   stop is the one thing Android will not let an app recover from until someone opens it.
4. **Keep Wi-Fi set to always on** (not “Wi-Fi turns off when the screen is off”). Samsung
   hides this under Connections → Wi-Fi → ⋮ → Intelligent Wi-Fi / Advanced.
5. **On Xiaomi, Huawei, Oppo, Vivo:** also add Serva Station to the maker’s own Autostart /
   “no battery restriction” list. Those overlays ignore Android’s exemption.
6. Leave the Serva notification in the shade. Clearing it (or turning notifications off)
   is how some builds decide the service is no longer wanted.

Don't know a network printer's IP? Switch it off, hold FEED, switch it on. It prints its own
settings slip. Ask whoever set up the WiFi to reserve that address, or printing stops the day
the router hands out a different one.

Turn the browser print-station switch **off** in Settings → Branch & printer on every other
device, so the café has one station and paper comes out where people expect it.

## Building

```
./gradlew :app:assembleRelease
```

Requires Android Studio or the command-line SDK. Nothing else — no third-party libraries
beyond AndroidX and coroutines.

## Known risks, in the order they are likely to bite

- **The off-screen WebView.** It is measured and laid out by hand rather than attached to a
  window, which is the standard way to run one headless but is the part most likely to
  differ across manufacturers' WebView builds. If a device renders blank, the fallback is to
  host the WebView in the activity and leave the screen on — the poll loop stays where it is.
- **Foreground service type.** Declared `specialUse`: `dataSync` is capped at a few hours a
  day on Android 15 and a station runs a whole shift, and `connectedDevice` crashes at
  `startForeground` unless the app also holds one of BLUETOOTH_*/CHANGE_WIFI_*/NFC/USB. The
  Bluetooth transport means the app now *does* hold `BLUETOOTH_CONNECT`, so `connectedDevice`
  would be legal — but it stays `specialUse`, which is not time-limited and is honest about a
  station whose printer is on the network. Its subtype needs justifying only if this is ever
  published on Play rather than sideloaded.
- **Manufacturer battery killers.** Xiaomi, Huawei and friends stop background apps whatever
  Android promises. A tablet on a charger is the friendly case; add the app to the device's
  "no battery optimisation" list during setup.
- **Bluetooth is slower and touchier than the network, by nature.** A receipt is ~63KB of
  raster; over SPP that is seconds, not milliseconds. Three behaviours in `BluetoothPrinter`
  exist only because of how these printers really act: status and the job share ONE
  connection (most accept only one link at a time), the job is written in 512-byte pieces
  (a small controller answers a firehose by dropping the middle of the receipt, silently),
  and the socket is held open after the last byte (closing early truncates whatever the
  printer has not consumed). If slips come out cut short or garbled, those three constants
  are the dials.
- **Bluetooth is untested on real hardware.** The LAN path has printed on a real printer; the
  Bluetooth path has been reasoned through and compiled (including the insecure-SPP and
  channel-1 fallbacks cheap clones need), and the first café to use it is the test. For a
  printer that sits on a counter and never moves, prefer the network.
- **The password is stored on the device.** Give a station its own staff account with the
  orders permission and nothing else.

## The same contract, without Android

`station/` in this repo is the identical loop in Node — for a Raspberry Pi, a mini PC or an
old laptop. The server cannot tell the two apart.
