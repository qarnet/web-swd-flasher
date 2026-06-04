export class EventBus {
  constructor() {
    this._topics = new Map();
  }

  on(topic, fn) {
    if (typeof fn !== "function") throw new TypeError("listener must be a function");
    let set = this._topics.get(topic);
    if (!set) {
      set = new Set();
      this._topics.set(topic, set);
    }
    set.add(fn);
    return () => this.off(topic, fn);
  }

  once(topic, fn) {
    const unsub = this.on(topic, (payload) => {
      unsub();
      fn(payload);
    });
    return unsub;
  }

  off(topic, fn) {
    const set = this._topics.get(topic);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this._topics.delete(topic);
  }

  emit(topic, payload) {
    const set = this._topics.get(topic);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${topic}" threw:`, err);
      }
    }
  }

  clear(topic) {
    if (topic === undefined) {
      this._topics.clear();
    } else {
      this._topics.delete(topic);
    }
  }

  listenerCount(topic) {
    return this._topics.get(topic)?.size ?? 0;
  }
}
