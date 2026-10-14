/**
 * LED patterns, escalating the longer the door is left open.
 * `blink` is [on ms, off ms]. The dashboard mirrors these timings in CSS.
 */
export const LED_PATTERNS = {
  off: { on: false },
  steady: { on: true }, // door open, alert not sent yet
  slow: { on: true, blink: [600, 600] }, // phone alert sent
  fast: { on: true, blink: [150, 150] }, // reminders: still open
};
