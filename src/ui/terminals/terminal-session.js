/**
 * Interface for terminal connection backends.
 *
 * Subclasses handle the transport-specific connection lifecycle
 * (RTT polling, DAP UART, Web Serial) while UnifiedTerminalPanel
 * handles the buffer / view / controller common layer.
 */
export class TerminalSession {
  /** @returns {string} Key used for localStorage and TerminalBuffer/Controller. */
  get channelId() { throw new Error("TerminalSession.channelId not implemented"); }

  /** Selector for the log <pre> element inside the panel root. */
  get logSelector() { return `#${this.channelId}-log`; }

  /** Selector for the send text <input> element. */
  get txInputSelector() { return `#${this.channelId}-tx-input`; }

  /** Selector for the Send <button> element. */
  get btnSendSelector() { return `#btn-${this.channelId}-send`; }

  /**
   * Whether the session is ready to transmit.
   * @returns {boolean}
   */
  isReady() { return false; }

  /**
   * Set up bus subscriptions and DOM event listeners for this session.
   * Called once during UnifiedTerminalPanel.mount().
   *
   * @param {object} opts
   * @param {Element} opts.rootEl - Panel root element.
   * @param {import("../../core/event-bus.js").EventBus} opts.bus
   * @param {function(): *} opts.backendProvider
   * @param {function(Uint8Array): void} opts.onData - Called when RX bytes arrive.
   * @param {function(): void} opts.onReadyChange - Called when isReady() changes.
   * @returns {function} Cleanup function (call on unmount).
   */
  init({ rootEl, bus, backendProvider, onData, onReadyChange }) { return () => {}; }

  /**
   * Transmit text to the device. The panel passes the raw text; the session
   * appends the appropriate line ending.
   * @param {string} text
   */
  async send(text) { throw new Error("TerminalSession.send not implemented"); }
}
