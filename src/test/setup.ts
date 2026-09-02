import '@testing-library/jest-dom';

// jsdom ships <dialog> without showModal/close, so ConfirmDialog would throw on
// mount. Shim the two methods rather than making the component defend against
// a gap that only exists in the test environment.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
