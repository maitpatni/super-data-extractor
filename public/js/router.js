const Router = {
  routes: {},

  register(path, handler) {
    this.routes[path] = handler;
  },

  current() {
    return window.location.hash.replace(/^#/, '') || '/';
  },

  navigate(path) {
    window.location.hash = path;
  },

  handle() {
    const route = this.current();
    const handler = this.routes[route] || this.routes['/'];
    if (handler) handler();
  },

  updateNav(route) {
    document.querySelectorAll('[data-route]').forEach((link) => {
      link.classList.toggle('active', link.dataset.route === route);
    });
  },

  init() {
    window.addEventListener('hashchange', () => this.handle());
    this.handle();
  },
};

window.Router = Router;
