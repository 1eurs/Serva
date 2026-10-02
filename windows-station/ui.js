// Setting a station up in four steps, then answering "is it working?". The main process
// does the work; this page only asks it to and shows what it says.
const $ = (id) => document.getElementById(id);

async function call(name, arg) {
  const r = await window.station.call(name, arg);
  if ('error' in r) throw new Error(r.error);
  return r.value;
}

let step = null;
let snap = null;
let oneBranch = false;
let scanSeq = 0;
let scanning = null; // the progress label while a search runs
let cancelled = false;

function show(n) {
  step = n;
  document.querySelectorAll('.step').forEach((el) => { el.hidden = Number(el.dataset.step) !== n; });
  $('ticks').hidden = n === 0;
  [...$('ticks').children].forEach((tick, i) => tick.classList.toggle('on', i < n));
  if (n === 0) paint(snap);
}

async function busy(button, label, work) {
  const text = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = text;
  }
}

function pick(list, title, detail, onPick, warn = false) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = warn ? 'pick warn' : 'pick';
  const strong = document.createElement('strong');
  strong.textContent = title;
  strong.dir = 'auto'; // a branch named in Arabic reads right to left
  row.append(strong);
  if (detail) {
    const span = document.createElement('span');
    span.textContent = detail;
    span.dir = 'auto';
    row.append(span);
  }
  row.onclick = onPick;
  list.append(row);
}

/* *** 1. sign in, 2. branch *** */

$('signInForm').onsubmit = (e) => {
  e.preventDefault();
  const username = $('username').value.trim();
  const password = $('password').value;
  $('signInError').textContent = '';
  if (!username || !password) {
    $('signInError').textContent = 'Fill in both.';
    return;
  }
  busy($('signIn'), 'Signing in…', async () => {
    try {
      const branches = await call('signIn', { username, password });
      $('password').value = '';
      if (!branches.length) throw new Error('This account has no branches to print for.');
      // One branch is the common case: skip a question with one answer.
      oneBranch = branches.length === 1;
      if (oneBranch) return pickBranch(branches[0]);
      $('branchList').replaceChildren();
      for (const b of branches) pick($('branchList'), b.name, b.address, () => pickBranch(b));
      show(2);
    } catch (err) {
      $('signInError').textContent = err.message;
    }
  });
};

async function pickBranch(b) {
  await call('pickBranch', { id: b.id, name: b.name });
  show(3);
  search(false);
}

/* *** 3. printer *** */

const FOUND_NONE = 'Nothing found. If the printer is switched on and plugged into the same router, it is probably on a different range of addresses than this computer — search wider below, or get its address from the printer itself: switch it off, hold the FEED button, switch it on. It prints its own settings slip with the address on it. Type that in with “Enter the address myself”.';
const FOUND_NONE_WIDER = 'Still nothing. Get the address off the printer itself — switch it off, hold FEED, switch it on, and it prints a slip with its address — then use “Enter the address myself”. If that will not connect either, the printer is on a network this computer cannot reach, and the two have to be joined to the same one.';
const found = (n) => (n === 1 ? 'Found your printer.'
  : `Found ${n} printers. Each has its own address — pick the one at your counter. Not sure which? Switch the printer off, hold FEED, switch it on: it prints its address. Type that with “Enter the address myself”.`);

function setScanning(label) {
  scanning = label;
  $('scan').disabled = !!label;
  $('wider').disabled = !!label;
  $('cancelScan').hidden = !label;
}

async function search(wider) {
  $('printerList').replaceChildren();
  $('manualBox').hidden = true;
  $('manual').hidden = false;
  $('wider').hidden = true;
  if (!(await call('onNetwork'))) {
    $('printerBody').textContent = 'This computer is not connected to a network. Plug it into the café router, or join the café Wi-Fi, then search again.';
    return;
  }
  const seq = ++scanSeq;
  cancelled = false;
  setScanning(wider ? 'Searching other address ranges…' : 'Searching your network…');
  $('printerBody').textContent = scanning;
  const printers = await call(wider ? 'scanWider' : 'scan').catch(() => []);
  if (seq !== scanSeq) return;
  setScanning(null);
  if (!printers.length && cancelled) {
    $('printerBody').textContent = 'Search stopped.';
    return;
  }
  $('printerBody').textContent = printers.length ? found(printers.length) : wider ? FOUND_NONE_WIDER : FOUND_NONE;
  // The printer that is plainly there and was not found is nearly always on another range.
  $('wider').hidden = printers.length > 0 || wider;
  for (const p of printers) {
    // "Answered as a printer" is the difference between the machine they want and
    // something that merely has the port open.
    const detail = p.paperOut ? 'Answered, but it is out of paper' : p.confirmed ? 'Answered as a printer' : `Print port ${p.port} is open`;
    pick($('printerList'), `Printer at ${p.host}`, detail, () => usePrinter(p.host, p.port));
  }
}

window.station.on('progress', ({ done, total }) => {
  if (scanning) $('printerBody').textContent = `${scanning} ${done} of ${total}`;
});

$('scan').onclick = () => search(false);
$('wider').onclick = () => search(true);
$('cancelScan').onclick = () => {
  cancelled = true;
  call('cancelScan');
  setScanning(null);
};
$('manual').onclick = () => {
  $('manualBox').hidden = false;
  $('manual').hidden = true;
  $('printerHost').focus();
};
$('back3').onclick = () => {
  scanSeq++;
  call('cancelScan');
  setScanning(null);
  show(oneBranch ? 1 : 2);
};

function wrongNetworkHelp(host, mine) {
  $('wrongNetworkBody').textContent = `The printer's address is ${host}, but this computer is on ${mine}, and the two ranges cannot reach each other — that is why nothing prints.

The printer is holding a fixed address from wherever it was set up before. Put it back on automatic: find the small button or pinhole on its network module — near the network socket or the aerial, not the FEED button. Switch the printer on while holding it and keep holding for about ten seconds. It then takes an address from this café's router, and Search finds it here straight away.

Many printers have no settings page at all, so do not spend time looking for one in a browser.`;
  $('wrongNetwork').showModal();
}

$('manualBox').onsubmit = (e) => {
  e.preventDefault();
  const host = $('printerHost').value.trim();
  $('manualError').textContent = '';
  if (!host) return;
  busy($('useManual'), 'Checking…', async () => {
    const r = await call('checkAddress', host);
    if (r.wrongNetwork) {
      $('manualError').textContent = 'Not on this computer’s network.';
      wrongNetworkHelp(host, r.wrongNetwork);
    } else if (!r.reachable) {
      $('manualError').textContent = 'Nothing answered at that address.';
    } else {
      usePrinter(host, 9100);
    }
  });
};

async function usePrinter(host, port) {
  scanSeq++;
  setScanning(null);
  await call('usePrinter', { host, port });
  $('askBox').hidden = true;
  $('troubleshoot').hidden = true;
  $('testBody').textContent = 'A slip should come out of the printer.';
  $('paper58').checked = snap?.paperWidth === 58;
  show(4);
}

/* *** 4. test slip *** */

$('testPrint').onclick = () => busy($('testPrint'), 'Sending…', async () => {
  try {
    await call('testSlip');
    // The socket taking the job says nothing about paper. Only the person at the printer knows.
    $('testBody').textContent = 'A slip should come out of the printer.';
    $('askBox').hidden = false;
  } catch (err) {
    $('testBody').textContent = `Could not reach the printer: ${err.message}`;
  }
});
$('yes').onclick = async () => {
  await call('finish', { paperWidth: $('paper58').checked ? 58 : 80 });
  show(0);
};
$('no').onclick = () => {
  $('askBox').hidden = true;
  $('troubleshoot').hidden = false;
};
document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => show(Number(b.dataset.back)); });

/* *** status *** */

function ago(at) {
  const ms = Date.now() - at;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  return `${Math.floor(ms / 3_600_000)} h ago`;
}

function dot(el, kind) {
  el.className = kind ? `dot ${kind}` : 'dot';
}

function paint(s) {
  if (s) snap = s;
  if (step !== 0 || !snap) return;
  const { paused, configured, status, cloudOk, printerOk, lastPullAt, lastPrintAt, printerHost } = snap;
  dot($('statusDot'), !paused && configured ? 'ok' : '');
  $('statusHeadline').textContent = paused ? 'Paused' : configured ? 'Printing' : 'Not printing';
  $('statusDetail').textContent = status;

  dot($('cloudDot'), cloudOk ? 'ok' : lastPullAt ? 'bad' : '');
  $('cloudHealth').textContent = !lastPullAt ? 'Connecting to Serva…' : cloudOk ? `Collecting tickets, last pull ${ago(lastPullAt)}` : 'Cannot reach Serva';

  const printerTrouble = /printer|paper/i.test(status) && !printerOk;
  dot($('printerDot'), printerOk ? 'ok' : printerTrouble || lastPrintAt ? 'bad' : '');
  $('printerHealth').textContent = printerOk ? `Printer ${printerHost} is answering`
    : printerTrouble ? status
    : lastPrintAt ? `Printer ${printerHost} is not answering`
    : `Printer ${printerHost} is waiting for the first ticket`;

  $('pause').textContent = paused ? 'Resume collecting' : 'Pause collecting';
  $('meta').textContent = `Signed in as ${snap.username} · ${snap.branchName} · station ${snap.stationId}`;
}

window.station.on('state', paint);
setInterval(() => paint(), 5000);

$('pause').onclick = () => call('togglePause');
$('statusTest').onclick = () => busy($('statusTest'), 'Sending…', async () => {
  try {
    await call('testSlip');
  } catch (err) {
    dot($('printerDot'), 'bad');
    $('printerHealth').textContent = `Could not reach the printer: ${err.message}`;
  }
});
$('change').onclick = async () => {
  await call('changeSetup');
  $('username').value = snap.username;
  show(1);
};

(async () => {
  snap = await call('snapshot');
  $('username').value = snap.username;
  show(snap.configured ? 0 : 1);
})();
