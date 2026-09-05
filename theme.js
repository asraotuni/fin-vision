(() => {
  const toggle = document.getElementById('themeToggle');
  function applyTheme(theme, persist = false){
    const selected = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = selected;
    const useDark = selected !== 'dark';
    toggle.querySelector('span').textContent = useDark ? '☾' : '☀';
    toggle.setAttribute('aria-label', useDark ? 'Use dark mode' : 'Use light mode');
    toggle.setAttribute('aria-pressed', String(!useDark));
    toggle.title = useDark ? 'Use dark mode' : 'Use light mode';
    if(persist){
      try { localStorage.setItem('hiramyatech-theme', selected); } catch {}
    }
  }
  toggle.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
  applyTheme(document.documentElement.dataset.theme);
})();
