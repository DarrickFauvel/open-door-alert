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
