// Lock-screen clock for the simulated phone (everything else is driven by Datastar).
const clock = document.querySelector('[data-clock]');
const date = document.querySelector('[data-date]');

const tick = () => {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  clock.dateTime = now.toISOString();
  date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
};

tick();
setInterval(tick, 10_000);

// QR code sheet: points phones at this dashboard's root URL (no trailing slash).
const qrDialog = document.querySelector('[data-qr-dialog]');
const qrCode = qrDialog.querySelector('[data-qr-code]');
let qrRendered = false;

document.querySelector('[data-qr-open]').addEventListener('click', async () => {
  qrDialog.showModal();
  if (qrRendered) return;
  const url = location.origin;
  qrDialog.querySelector('[data-qr-url]').textContent = url;
  try {
    const { default: qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm');
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrCode.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    qrRendered = true;
  } catch {
    qrCode.textContent = 'Could not load the QR code generator.';
  }
});

// Close on backdrop click for browsers without dialog[closedby] support.
qrDialog.addEventListener('click', (e) => {
  if (e.target === qrDialog) qrDialog.close();
});
