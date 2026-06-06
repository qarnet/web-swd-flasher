const _encoder = new TextEncoder();

export class RawInputMode {
  constructor(session) {
    this._session = session;
  }
  handle(data) {
    if (!this._session.isReady()) return;
    void this._session.sendRaw(_encoder.encode(data));
  }
}
