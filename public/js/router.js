const Router = {
  routes: {},
  currentRoute: null,

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  register(path, handler) {
    this.routes[path] = handler;
  },

  navigate(path) {
    window.location.hash = path;
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const path = hash.split('?')[0];
    
    this.currentRoute = path;
    this.updateActiveNav(path);

    const handler = this.routes[path];
    if (handler) {
      handler();
    } else {
      this.routes['/']()
    }
  },

  updateActiveNav(path) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const route = item.getAttribute('data-route');
      item.classList.toggle('active', route === path);
    });
  }
};

window.Router = Router;