import { loadPage, pageAside } from './page';

// index.html itself: what docs/FRONTEND_ARCHITECTURE.md section 3, rules 2 and 6 ask of the page,
// checked on the file every view's test loads.
describe('index.html', () => {
  it('loads one module script and one style sheet, by the names the build writes', () => {
    const page = pageAside();
    const scripts = [...page.querySelectorAll('script')];
    expect(scripts.map((s) => [s.getAttribute('type'), s.getAttribute('src'), s.textContent])).toEqual([['module', 'app.js', '']]);
    expect([...page.querySelectorAll('link')].map((l) => [l.getAttribute('rel'), l.getAttribute('href')])).toEqual([['stylesheet', 'style.css']]);
  });

  it('has nothing inline: no <style>, no style attribute, no handler attribute', () => {
    const page = pageAside();
    expect(page.querySelectorAll('style')).toHaveLength(0);
    const attributes = [...page.querySelectorAll('*')].flatMap((element) => element.getAttributeNames());
    expect(attributes.filter((name) => name === 'style' || name.startsWith('on'))).toEqual([]);
  });

  it('starts with everything hidden: the script decides what is shown', () => {
    loadPage();
    const top = [...document.body.children];
    expect(top.map((element) => element.id)).toEqual(['login', 'app']);
    expect(top.every((element) => (element as HTMLElement).hidden)).toBe(true);
  });
});
